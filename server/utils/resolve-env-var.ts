export function resolveEnvVar(name: string, defaultValue: string): string
export function resolveEnvVar(name: string, defaultValue?: string): string | undefined
export function resolveEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue
}
