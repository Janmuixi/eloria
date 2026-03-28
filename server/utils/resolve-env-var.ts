export function resolveEnvVar(name: string, defaultValue?: string): string | undefined {
  const runtimeConfig = useRuntimeConfig()
  return (runtimeConfig[name] as string) ?? process.env[name] ?? defaultValue
}
