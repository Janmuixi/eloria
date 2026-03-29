export function resolveEnvVar(name: string, defaultValue: string): string
export function resolveEnvVar(name: string, defaultValue?: string): string | undefined
export function resolveEnvVar(name: string, defaultValue?: string): string | undefined {
  const runtimeConfig = useRuntimeConfig()
  return (runtimeConfig as Record<string, string | undefined>)[name] ?? process.env[name] ?? defaultValue
}
