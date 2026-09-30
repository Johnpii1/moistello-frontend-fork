/**
 * Upload rules shared by the browser picker and upload API.
 *
 * Keep this module free of Node and DOM dependencies so both runtimes enforce
 * precisely the same policy before any bytes are transferred.
 */
export const UPLOAD_TYPE_POLICIES = {
  ".md": { label: "Markdown (.md)", maxBytes: 5 * 1024 * 1024 },
  ".html": { label: "HTML (.html)", maxBytes: 5 * 1024 * 1024 },
} as const

export type UploadExtension = keyof typeof UPLOAD_TYPE_POLICIES

export const ALLOWED_UPLOAD_EXTENSIONS = Object.keys(UPLOAD_TYPE_POLICIES) as UploadExtension[]

export function getUploadExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".")
  return index > 0 ? fileName.slice(index).toLowerCase() : ""
}

export function isAllowedUploadExtension(extension: string): extension is UploadExtension {
  return extension in UPLOAD_TYPE_POLICIES
}

export function getUploadLimitsDescription(): string {
  return ALLOWED_UPLOAD_EXTENSIONS.map((extension) => {
    const policy = UPLOAD_TYPE_POLICIES[extension]
    return `${policy.label}: max ${policy.maxBytes / 1024 / 1024} MB`
  }).join("; ")
}

export type UploadValidation =
  | { ok: true; extension: UploadExtension }
  | { ok: false; error: string }

export function validateUploadFile(fileName: string, size: number): UploadValidation {
  const extension = getUploadExtension(fileName)
  if (!isAllowedUploadExtension(extension)) {
    return { ok: false, error: `Unsupported file type. Allowed types: ${getUploadLimitsDescription()}.` }
  }

  const { maxBytes, label } = UPLOAD_TYPE_POLICIES[extension]
  if (size > maxBytes) {
    return { ok: false, error: `${label} files must be ${maxBytes / 1024 / 1024} MB or smaller.` }
  }

  return { ok: true, extension }
}
