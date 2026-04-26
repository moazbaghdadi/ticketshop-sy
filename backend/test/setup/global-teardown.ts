export default async function globalTeardown(): Promise<void> {
    const container = globalThis.__TC_PG__
    if (container) {
        await container.stop()
    }
}
