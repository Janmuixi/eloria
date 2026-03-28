export function resolveEnvVar(name: string, defaultValue?: string) {
  const runtimeConfig = useRuntimeConfig()
  return runtimeConfig[name] ?? process.env[name] ?? defaultValue
}