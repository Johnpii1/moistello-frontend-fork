import { expect, test } from "@playwright/test"

const proposal = {
  id: "prop-quorum",
  title: "Quorum test proposal",
  description: "A proposal used to verify the complete voting lifecycle.",
  status: "active",
  category: "Rule Amendment",
  votesFor: 999,
  votesAgainst: 0,
  votesAbstain: 0,
  timelockEndsAt: null,
  createdAt: "2025-01-01",
}

test("casts a vote, reaches quorum, and shows the executed proposal", async ({ page }) => {
  let hasExecuted = false

  await page.route(/http:\/\/localhost:1100\/v1\/governance\/proposals\/prop-quorum(?:\/votes)?$/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON()
      expect(body).toMatchObject({ support: true })
      hasExecuted = true
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, proposal: { ...proposal, votesFor: 1000, status: "executed" } }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ proposal: hasExecuted ? { ...proposal, votesFor: 1000, status: "executed" } : proposal }),
    })
  })

  await page.goto("/governance/prop-quorum")
  await expect(page.getByRole("heading", { name: proposal.title })).toBeVisible()
  await expect(page.getByText("Total: 999 votes")).toBeVisible()
  await expect(page.getByText("Quorum threshold: 1,000 votes")).toBeVisible()

  await page.getByTestId("vote-for-button").click()
  await page.getByTestId("submit-confirm-vote").click()

  await expect(page.getByText("You voted FOR on this proposal.")).toBeVisible()
  await expect(page.getByText("Total: 1000 votes")).toBeVisible()
  await expect(page.getByText("executed", { exact: true })).toBeVisible()
})
