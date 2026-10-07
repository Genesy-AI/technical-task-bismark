/* eslint-disable @typescript-eslint/no-explicit-any -- these aliases exist to hold intentional any escape hatches */
type $TSFixMe = any
type $TSFixMeFunction = (...args: any[]) => any

type TablerIcon = typeof import('@tabler/icons-react').IconX

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>
