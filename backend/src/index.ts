import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client'
import { verifyEmailWorkflow } from './workflows'
import { generateMessageFromTemplate } from './utils/messageGenerator'
import { isValidCountryCode } from './utils/countryCode'
import { isValidLinkedinUrl } from './utils/linkedinUrl'
import { parseYearsInRole } from './utils/yearsInRole'
import { runTemporalWorker } from './worker'

// Overridable so integration tests can point at an isolated SQLite file instead of prisma/dev.db.
const prisma = new PrismaClient(
  process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined
)
const app = express()
app.use(express.json())

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body
  const lead = await prisma.lead.update({
    where: {
      id: Number(id),
    },
    data: {
      firstName: String(name),
      email: String(email),
    },
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
    /* v8 ignore start -- generic DB-failure fallback, not reachable without mocking Prisma internals */
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
  /* v8 ignore stop */
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
    /* v8 ignore start -- generic DB-failure fallback, not reachable without mocking Prisma internals */
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
  /* v8 ignore stop */
})

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    const errors: Array<{ lead: any; error: string }> = []
    const warnings: Array<{ lead: any; warning: string }> = []

    for (const lead of uniqueLeads) {
      const trimmedCountryCode = lead.countryCode ? String(lead.countryCode).trim() : ''
      let countryCode: string | null = null

      if (trimmedCountryCode) {
        if (isValidCountryCode(trimmedCountryCode)) {
          countryCode = trimmedCountryCode.toUpperCase()
        } else {
          warnings.push({
            lead,
            warning: `Invalid country code "${trimmedCountryCode}" (expected a 2-letter code) — cleared`,
          })
        }
      }

      const trimmedYearsInRole = lead.yearsInRole ? String(lead.yearsInRole).trim() : ''
      let yearsInRole: number | null = null

      if (trimmedYearsInRole) {
        yearsInRole = parseYearsInRole(trimmedYearsInRole)
        if (yearsInRole === null) {
          warnings.push({
            lead,
            warning: `Invalid years in role "${trimmedYearsInRole}" (expected a non-negative whole number) — cleared`,
          })
        }
      }

      const trimmedLinkedinUrl = lead.linkedinUrl ? String(lead.linkedinUrl).trim() : ''
      let linkedinUrl: string | null = null

      if (trimmedLinkedinUrl) {
        if (isValidLinkedinUrl(trimmedLinkedinUrl)) {
          linkedinUrl = trimmedLinkedinUrl
        } else {
          warnings.push({
            lead,
            warning: `Invalid LinkedIn URL "${trimmedLinkedinUrl}" — cleared`,
          })
        }
      }

      try {
        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode,
            companyName: lead.companyName ? lead.companyName.trim() : null,
            phoneNumber: lead.phoneNumber ? String(lead.phoneNumber).trim() : null,
            yearsInRole,
            linkedinUrl,
          },
        })
        importedCount++
        /* v8 ignore start -- per-row DB-failure fallback, not reachable without mocking Prisma internals */
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      /* v8 ignore stop */
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      errors,
      warnings,
    })
    /* v8 ignore start -- generic DB-failure fallback, not reachable without mocking Prisma internals */
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
  /* v8 ignore stop */
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: 'localhost:7233' })
    const client = new Client({ connection, namespace: 'default' })

    const settledResults = await Promise.allSettled(
      leads.map(async (lead) => {
        const isVerified = await client.workflow.execute(verifyEmailWorkflow, {
          taskQueue: 'myQueue',
          workflowId: `verify-email-${lead.id}-${Date.now()}`,
          args: [lead.email],
        })

        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailVerified: Boolean(isVerified) },
        })

        return { leadId: lead.id, emailVerified: isVerified }
      })
    )

    let verifiedCount = 0
    const results: Array<{ leadId: number; emailVerified: boolean }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    settledResults.forEach((outcome, index) => {
      const lead = leads[index]
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
        verifiedCount += 1
      } else {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error',
        })
      }
    })

    await connection.close()

    res.json({ success: true, verifiedCount, results, errors })
    /* v8 ignore start -- generic connection/DB-failure fallback, not reachable without mocking Temporal/Prisma internals */
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
  /* v8 ignore stop */
})

export { app }

/* v8 ignore start -- real server/worker bootstrap, intentionally skipped under NODE_ENV=test */
// Importing this module for tests must not start a real server or a real Temporal worker.
if (process.env.NODE_ENV !== 'test') {
  app.listen(4000, () => {
    console.log('Express server is running on port 4000')
  })

  runTemporalWorker().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
/* v8 ignore stop */
