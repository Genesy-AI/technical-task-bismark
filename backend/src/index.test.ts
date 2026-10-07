import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { TEST_DATABASE_URL } from './test/globalSetup'

const workflowExecuteMock = vi.fn()
const connectionCloseMock = vi.fn()

// index.ts talks to a real Temporal server for /leads/verify-emails; no Temporal server
// runs in this test suite, so we mock the client to control what each workflow "returns".
vi.mock('@temporalio/client', () => ({
  Connection: { connect: vi.fn().mockResolvedValue({ close: connectionCloseMock }) },
  Client: vi.fn().mockImplementation(() => ({ workflow: { execute: workflowExecuteMock } })),
}))

let app: Express

// Dynamic import (not a top-level await) so tsc -p . can still compile this file with
// module: commonjs, and so the @temporalio/client mock above is registered before index.ts loads it.
beforeAll(async () => {
  ;({ app } = await import('./index'))
})

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL })

async function createLead(overrides: Partial<Record<string, unknown>> = {}) {
  return prisma.lead.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      ...overrides,
    },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.lead.deleteMany({})
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('CORS preflight', () => {
  it('short-circuits OPTIONS requests with a 200 and no body', async () => {
    const res = await request(app).options('/leads')

    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('POST /leads', () => {
  it('creates a lead from name/lastName/email', async () => {
    const res = await request(app)
      .post('/leads')
      .send({ name: 'Jane', lastName: 'Roe', email: 'jane@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ firstName: 'Jane', lastName: 'Roe', email: 'jane@example.com' })
  })

  it('rejects a request missing required fields', async () => {
    const res = await request(app).post('/leads').send({ name: 'Jane' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/i)
  })
})

describe('GET /leads/:id', () => {
  it('returns the lead when it exists', async () => {
    const lead = await createLead()

    const res = await request(app).get(`/leads/${lead.id}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: lead.id, firstName: 'John' })
  })

  it('returns null when the lead does not exist', async () => {
    const res = await request(app).get('/leads/999999')

    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })
})

describe('GET /leads', () => {
  it('lists all leads', async () => {
    await createLead({ email: 'a@example.com' })
    await createLead({ email: 'b@example.com' })

    const res = await request(app).get('/leads')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /leads/:id', () => {
  it('updates name/email', async () => {
    const lead = await createLead()

    const res = await request(app)
      .patch(`/leads/${lead.id}`)
      .send({ name: 'Johnny', email: 'johnny@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ firstName: 'Johnny', email: 'johnny@example.com' })
  })
})

describe('DELETE /leads/:id', () => {
  it('deletes a single lead', async () => {
    const lead = await createLead()

    const res = await request(app).delete(`/leads/${lead.id}`)

    expect(res.status).toBe(200)
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toBeNull()
  })
})

describe('DELETE /leads', () => {
  it('rejects a request with no JSON body', async () => {
    const res = await request(app).delete('/leads')

    expect(res.status).toBe(400)
  })

  it('rejects a missing/invalid ids array', async () => {
    const res = await request(app).delete('/leads').send({})

    expect(res.status).toBe(400)
  })

  it('bulk deletes leads by id', async () => {
    const a = await createLead({ email: 'a@example.com' })
    const b = await createLead({ email: 'b@example.com' })

    const res = await request(app)
      .delete('/leads')
      .send({ ids: [a.id, b.id] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deletedCount: 2 })
  })
})

describe('POST /leads/generate-messages', () => {
  it('rejects a request with no JSON body', async () => {
    const res = await request(app).post('/leads/generate-messages')

    expect(res.status).toBe(400)
  })

  it('rejects a non-string template', async () => {
    const lead = await createLead()

    const res = await request(app)
      .post('/leads/generate-messages')
      .send({ leadIds: [lead.id], template: 42 })

    expect(res.status).toBe(400)
  })

  it('validates leadIds and template', async () => {
    const res = await request(app).post('/leads/generate-messages').send({ leadIds: [], template: 'x' })

    expect(res.status).toBe(400)
  })

  it('returns 404 when none of the leadIds exist', async () => {
    const res = await request(app)
      .post('/leads/generate-messages')
      .send({ leadIds: [999999], template: 'Hi {firstName}' })

    expect(res.status).toBe(404)
  })

  it('generates and persists a message per lead', async () => {
    const lead = await createLead()

    const res = await request(app)
      .post('/leads/generate-messages')
      .send({ leadIds: [lead.id], template: 'Hi {firstName}' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, generatedCount: 1, errors: [] })
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
      message: 'Hi John',
    })
  })

  it('collects a per-lead error when the template references a field the lead lacks, without failing the batch', async () => {
    const lead = await createLead({ companyName: null })

    const res = await request(app)
      .post('/leads/generate-messages')
      .send({ leadIds: [lead.id], template: 'Hi {firstName}, from {companyName}' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, generatedCount: 0 })
    expect(res.body.errors).toEqual([
      { leadId: lead.id, leadName: 'John Doe', error: 'Missing required field: companyName' },
    ])
  })
})

describe('POST /leads/bulk', () => {
  it('rejects a request with no JSON body', async () => {
    const res = await request(app).post('/leads/bulk')

    expect(res.status).toBe(400)
  })

  it('rejects a missing/empty leads array', async () => {
    const res = await request(app).post('/leads/bulk').send({ leads: [] })

    expect(res.status).toBe(400)
  })

  it('rejects when no lead in the payload has the required fields', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({ leads: [{ firstName: '', lastName: 'Doe', email: 'x@example.com' }] })

    expect(res.status).toBe(400)
  })

  it('imports valid leads, skips duplicates, and counts invalid ones', async () => {
    await createLead({ firstName: 'Existing', lastName: 'Person', email: 'existing@example.com' })

    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [
          { firstName: 'New', lastName: 'Person', email: 'new@example.com' },
          { firstName: 'Existing', lastName: 'Person', email: 'dup@example.com' },
          { firstName: '', lastName: 'Invalid', email: 'invalid@example.com' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, importedCount: 1, duplicatesSkipped: 1, invalidLeads: 1 })
  })

  it('clears an invalid countryCode, still imports the lead, and reports a warning instead of failing it', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [{ firstName: 'Bad', lastName: 'Code', email: 'bad@example.com', countryCode: 'XXX' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.importedCount).toBe(1)
    expect(res.body.warnings).toEqual([
      {
        lead: { firstName: 'Bad', lastName: 'Code', email: 'bad@example.com', countryCode: 'XXX' },
        warning: 'Invalid country code "XXX" (expected a 2-letter code) — cleared',
      },
    ])
    const created = await prisma.lead.findFirst({ where: { email: 'bad@example.com' } })
    expect(created?.countryCode).toBeNull()
  })

  it('accepts a numeric-looking-but-wrong-length countryCode and clears it too', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [{ firstName: 'Numeric', lastName: 'Code', email: 'numeric@example.com', countryCode: '12' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.warnings).toHaveLength(1)
    const created = await prisma.lead.findFirst({ where: { email: 'numeric@example.com' } })
    expect(created?.countryCode).toBeNull()
  })

  it('normalizes a valid countryCode to uppercase and reports no warning', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [{ firstName: 'Good', lastName: 'Code', email: 'good@example.com', countryCode: 'us' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.warnings).toEqual([])
    const created = await prisma.lead.findFirst({ where: { email: 'good@example.com' } })
    expect(created?.countryCode).toBe('US')
  })

  it('imports phoneNumber, yearsInRole, and linkedinUrl when valid', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [
          {
            firstName: 'Full',
            lastName: 'Fields',
            email: 'full@example.com',
            phoneNumber: '+1-555-0100',
            yearsInRole: '5',
            linkedinUrl: 'https://www.linkedin.com/in/full-fields',
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.warnings).toEqual([])
    const created = await prisma.lead.findFirst({ where: { email: 'full@example.com' } })
    expect(created).toMatchObject({
      phoneNumber: '+1-555-0100',
      yearsInRole: 5,
      linkedinUrl: 'https://www.linkedin.com/in/full-fields',
    })
  })

  it('clears an invalid yearsInRole, still imports the lead, and reports a warning', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [{ firstName: 'Bad', lastName: 'Years', email: 'badyears@example.com', yearsInRole: 'five' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.warnings).toEqual([
      {
        lead: { firstName: 'Bad', lastName: 'Years', email: 'badyears@example.com', yearsInRole: 'five' },
        warning: 'Invalid years in role "five" (expected a non-negative whole number) — cleared',
      },
    ])
    const created = await prisma.lead.findFirst({ where: { email: 'badyears@example.com' } })
    expect(created?.yearsInRole).toBeNull()
  })

  it('clears an invalid linkedinUrl, still imports the lead, and reports a warning', async () => {
    const res = await request(app)
      .post('/leads/bulk')
      .send({
        leads: [
          {
            firstName: 'Bad',
            lastName: 'Linkedin',
            email: 'badlinkedin@example.com',
            linkedinUrl: 'not-a-url',
          },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.warnings).toEqual([
      {
        lead: {
          firstName: 'Bad',
          lastName: 'Linkedin',
          email: 'badlinkedin@example.com',
          linkedinUrl: 'not-a-url',
        },
        warning: 'Invalid LinkedIn URL "not-a-url" — cleared',
      },
    ])
    const created = await prisma.lead.findFirst({ where: { email: 'badlinkedin@example.com' } })
    expect(created?.linkedinUrl).toBeNull()
  })
})

describe('POST /leads/verify-emails', () => {
  it('rejects a request with no JSON body', async () => {
    const res = await request(app).post('/leads/verify-emails')

    expect(res.status).toBe(400)
  })

  it('rejects a missing/empty leadIds array', async () => {
    const res = await request(app).post('/leads/verify-emails').send({ leadIds: [] })

    expect(res.status).toBe(400)
  })

  it('returns 404 when none of the leadIds exist', async () => {
    const res = await request(app)
      .post('/leads/verify-emails')
      .send({ leadIds: [999999] })

    expect(res.status).toBe(404)
  })

  it('verifies each lead via the workflow and persists the result', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockResolvedValue(true)

    const res = await request(app)
      .post('/leads/verify-emails')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, verifiedCount: 1 })
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
      emailVerified: true,
    })
    expect(connectionCloseMock).toHaveBeenCalled()
  })

  it('collects a per-lead error instead of failing the whole batch', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockRejectedValue(new Error('workflow boom'))

    const res = await request(app)
      .post('/leads/verify-emails')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body.verifiedCount).toBe(0)
    expect(res.body.errors).toEqual([{ leadId: lead.id, leadName: 'John Doe', error: 'workflow boom' }])
  })

  it('verifies a batch in parallel instead of one lead blocking the rest', async () => {
    const slow = await createLead({ email: 'slow@example.com' })
    const fast = await createLead({ email: 'fast@example.com' })

    workflowExecuteMock.mockImplementation(async (_workflow, options) => {
      const delay = options.args[0] === 'slow@example.com' ? 60 : 10
      await new Promise((resolve) => setTimeout(resolve, delay))
      return true
    })

    const start = Date.now()
    const res = await request(app)
      .post('/leads/verify-emails')
      .send({ leadIds: [slow.id, fast.id] })
    const elapsed = Date.now() - start

    expect(res.status).toBe(200)
    expect(res.body.verifiedCount).toBe(2)
    // Sequential execution would take >=70ms (60ms + 10ms); parallel stays close to the slowest one.
    expect(elapsed).toBeLessThan(70)
  })

  it('keeps processing the rest of the batch when one lead rejects, in parallel', async () => {
    const ok = await createLead({ email: 'ok@example.com' })
    const bad = await createLead({ email: 'bad@example.com' })

    workflowExecuteMock.mockImplementation(async (_workflow, options) => {
      if (options.args[0] === 'bad@example.com') {
        throw new Error('workflow boom')
      }
      return true
    })

    const res = await request(app)
      .post('/leads/verify-emails')
      .send({ leadIds: [ok.id, bad.id] })

    expect(res.status).toBe(200)
    expect(res.body.verifiedCount).toBe(1)
    expect(res.body.results).toEqual([{ leadId: ok.id, emailVerified: true }])
    expect(res.body.errors).toEqual([{ leadId: bad.id, leadName: 'John Doe', error: 'workflow boom' }])
  })
})

describe('POST /leads/enrich-phone', () => {
  it('rejects a request with no JSON body', async () => {
    const res = await request(app).post('/leads/enrich-phone')

    expect(res.status).toBe(400)
  })

  it('rejects a missing/empty leadIds array', async () => {
    const res = await request(app).post('/leads/enrich-phone').send({ leadIds: [] })

    expect(res.status).toBe(400)
  })

  it('returns 404 when none of the leadIds exist', async () => {
    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [999999] })

    expect(res.status).toBe(404)
  })

  it('enriches a lead with the phone the workflow returns, using a deterministic workflowId', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockResolvedValue('+1-555-0100')

    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, enrichedCount: 1, noDataCount: 0, skippedCount: 0 })
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
      phoneNumber: '+1-555-0100',
      phoneEnriched: true,
    })
    expect(workflowExecuteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workflowId: `enrich-phone-${lead.id}` })
    )
    expect(connectionCloseMock).toHaveBeenCalled()
  })

  it('passes companyName as companyWebsite (Orion Connect requires a non-empty value and there is no dedicated website field)', async () => {
    const lead = await createLead({ companyName: 'Acme Inc' })
    workflowExecuteMock.mockResolvedValue(null)

    await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(workflowExecuteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        args: [
          expect.objectContaining({
            fullName: 'John Doe',
            companyWebsite: 'Acme Inc',
            email: lead.email,
            jobTitle: null,
          }),
        ],
      })
    )
  })

  it('marks a lead as "no data found" (phoneEnriched: false) when no provider finds a phone', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockResolvedValue(null)

    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ enrichedCount: 0, noDataCount: 1, skippedCount: 0 })
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
      phoneNumber: null,
      phoneEnriched: false,
    })
  })

  it('skips a lead that already has a phoneNumber instead of calling the providers', async () => {
    const lead = await createLead({ phoneNumber: '+1-555-9999' })

    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ enrichedCount: 0, noDataCount: 0, skippedCount: 1 })
    expect(workflowExecuteMock).not.toHaveBeenCalled()
  })

  it('skips a lead already marked as "no data found" on a prior run (idempotent)', async () => {
    const lead = await createLead({ phoneEnriched: false })

    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ skippedCount: 1 })
    expect(workflowExecuteMock).not.toHaveBeenCalled()
  })

  it('does not re-run enrichment on a second call for the same already-enriched lead', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockResolvedValue('+1-555-0100')

    await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    workflowExecuteMock.mockClear()

    const secondRes = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(secondRes.status).toBe(200)
    expect(secondRes.body).toMatchObject({ skippedCount: 1 })
    expect(workflowExecuteMock).not.toHaveBeenCalled()
  })

  it('collects a per-lead error instead of failing the whole batch', async () => {
    const lead = await createLead()
    workflowExecuteMock.mockRejectedValue(new Error('all providers failed'))

    const res = await request(app)
      .post('/leads/enrich-phone')
      .send({ leadIds: [lead.id] })

    expect(res.status).toBe(200)
    expect(res.body.errors).toEqual([
      { leadId: lead.id, leadName: 'John Doe', error: 'all providers failed' },
    ])
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
      phoneNumber: null,
      phoneEnriched: null,
    })
  })
})
