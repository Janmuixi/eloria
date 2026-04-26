export function useTemplatePreviewUrl() {
  const { locale } = useI18n()
  return (template: { slug: string }) =>
    `/images/templates/${locale.value}/${template.slug}.jpg`
}
