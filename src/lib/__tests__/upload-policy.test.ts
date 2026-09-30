import { describe, expect, it } from "vitest"
import { UPLOAD_TYPE_POLICIES, validateUploadFile } from "@/lib/upload-policy"
import { validateUpload } from "@/app/api/upload/publish"

describe("shared upload policy", () => {
  it("lists allowed types and their limits in client-side rejection messages", () => {
    const result = validateUploadFile("resume.pdf", 1)
    expect(result).toEqual({
      ok: false,
      error: "Unsupported file type. Allowed types: Markdown (.md): max 5 MB; HTML (.html): max 5 MB.",
    })
  })

  it("enforces each type's limit identically for browser and server validation", () => {
    for (const [extension, policy] of Object.entries(UPLOAD_TYPE_POLICIES)) {
      const fileName = `valid${extension}`
      expect(validateUploadFile(fileName, policy.maxBytes).ok).toBe(true)
      expect(validateUpload(fileName, policy.maxBytes).ok).toBe(true)
      expect(validateUploadFile(fileName, policy.maxBytes + 1).ok).toBe(false)
      expect(validateUpload(fileName, policy.maxBytes + 1).ok).toBe(false)
    }
  })
})
