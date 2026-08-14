import { VerifyForm } from '@/components/verify/VerifyForm'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const single = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key])

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Verify a run</h1>
        <p className="text-slate-600">
          Paste the seeds to replay every hand the machine played, and check them against the
          commitment it published before your first tap.
        </p>
      </header>

      <VerifyForm
        initialServerSeed={single('serverSeed')}
        initialClientSeed={single('clientSeed')}
        initialCommitment={single('commitment')}
        initialRounds={single('rounds')}
      />
    </main>
  )
}
