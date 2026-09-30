"use client"

import * as Sentry from "@sentry/nextjs"
import type { AuthErrorCode } from "@/stores/auth-flow-store"
import { attachLogFlushListeners, logger, scrubLogString, scrubLogValue } from "@/lib/logger"

export type MetricName =
  | "governance.proposal.created"
  | "governance.proposal.executed"
  | "governance.vote.cast"
  | "governance.timelock.expired"
  | "reputation.tier.upgraded"
  | "reputation.tier.downgraded"
  | "wallet.connect.attempt"
  | "wallet.connect.success"
  | "wallet.connect.failure"
  | "wallet.sign.attempt"
  | "wallet.sign.success"
  | "wallet.sign.failure"
  | "feature.flag.toggled"
  | "page.view"
  | "error.unhandled"
  | "auth.flow.started"
  | "auth.login.no_credential"
  | "auth.sign.completed"
  | "auth.error.caught"

interface AuthErrorContext {
  step?: string
  mode?: string
  walletId?: string | null
  errorCode?: AuthErrorCode | string
  address?: string | null
}

export interface MetricEvent {
  name: MetricName
  value?: number
  tags?: Record<string, string>
  timestamp: number
}

const METRIC_FLUSH_SIZE = 50
const METRIC_FLUSH_INTERVAL = 30_000
const MAX_BUFFER_SIZE = 500

let metricBuffer: MetricEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

function scrubReporterError(error: unknown): Error | string | unknown {
  if (error instanceof Error) {
    const safe = new Error(scrubLogString(error.message))
    safe.name = error.name
    safe.stack = error.stack ? scrubLogString(error.stack) : undefined
    return safe
  }
  if (typeof error === "string") return scrubLogString(error)
  return scrubLogValue(error)
}

function scrubMetricTags(tags?: Record<string, string>): Record<string, string> | undefined {
  if (!tags) return undefined
  return scrubLogValue(tags) as Record<string, string>
}

export function captureAuthError(error: unknown, context: AuthErrorContext): void {
  const tags: Record<string, string> = {
    step: context.step ?? "unknown",
    mode: context.mode ?? "unknown",
    errorCode: context.errorCode ?? "unknown",
  }

  if (context.walletId) tags.walletId = context.walletId
  const safeTags = scrubMetricTags(tags) ?? {}

  recordMetric("auth.error.caught", 1, safeTags)

  const dsn = typeof process !== "undefined"
    ? (process.env as Record<string, string>).NEXT_PUBLIC_SENTRY_DSN
    : undefined

  if (dsn) {
    Sentry.withScope((scope) => {
      scope.setTags(safeTags)
      scope.setExtra("mode", scrubLogString(context.mode ?? "unknown"))
      scope.setExtra("step", scrubLogString(context.step ?? "unknown"))
      scope.addBreadcrumb({
        category: "auth",
        message: scrubLogString(`Auth error in ${context.mode}/${context.step}`),
        level: "error",
      })

      // Scrub before handing data to Sentry: it is a transport boundary.
      Sentry.captureException(scrubReporterError(error))
    })
  } else {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[AuthError] [${context.mode}/${context.step}] ${message}`, {
      step: context.step ?? "unknown",
      mode: context.mode ?? "unknown",
      errorCode: context.errorCode ?? "unknown",
      error,
    })
  }
}

export function recordMetric(
  name: MetricName,
  value?: number,
  tags?: Record<string, string>,
): void {
  const event: MetricEvent = {
    name,
    value,
    tags: scrubMetricTags(tags),
    timestamp: Date.now(),
  }
  metricBuffer.push(event)

  if (metricBuffer.length >= MAX_BUFFER_SIZE) {
    metricBuffer.splice(0, metricBuffer.length - MAX_BUFFER_SIZE)
  }

  if (metricBuffer.length >= METRIC_FLUSH_SIZE) {
    flushMetrics()
  }
}

function startFlushTimer(): void {
  if (flushTimer) return
  flushTimer = setInterval(flushMetrics, METRIC_FLUSH_INTERVAL)
}

export function flushMetrics(): void {
  if (metricBuffer.length === 0) return
  const batch = metricBuffer.splice(0, metricBuffer.length)

  const endpoint = typeof process !== "undefined"
    ? (process.env as Record<string, string>).NEXT_PUBLIC_METRICS_ENDPOINT
    : undefined

  if (endpoint) {
    const payload = JSON.stringify(batch)

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(endpoint, payload)
    } else {
      fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {
        metricBuffer.unshift(...batch)
      })
    }
  } else {
    // Only warn once per session to avoid spam
    if (typeof window !== "undefined" && !(window as unknown as Record<string, unknown>).__metricsWarned) {
      logger.warn("NEXT_PUBLIC_METRICS_ENDPOINT is not configured; metrics collection is disabled")
      ;(window as unknown as Record<string, unknown>).__metricsWarned = true
    }
  }
}

export function flushMetricsOnUnload(): void {
  if (typeof window === "undefined") return
  window.addEventListener("beforeunload", () => {
    flushMetrics()
  })
  window.addEventListener("pagehide", () => {
    flushMetrics()
  })
}

export function initMonitoring(): void {
  if (typeof window === "undefined") return
  startFlushTimer()
  flushMetricsOnUnload()
  attachLogFlushListeners()

  const pagePath = window.location.pathname
  recordMetric("page.view", 1, { path: pagePath })

  window.addEventListener("error", (event) => {
    Sentry.captureException(scrubReporterError(event.error ?? event.message))
    recordMetric("error.unhandled", 1, {
      message: scrubLogString(event.message),
      source: event.filename || "unknown",
    })
  })

  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(scrubReporterError(event.reason ?? event.reason?.message))
    recordMetric("error.unhandled", 1, {
      message: scrubLogString(event.reason?.message || String(event.reason)),
      source: "unhandled-rejection",
    })
  })
}

export function getMetricBufferSize(): number {
  return metricBuffer.length
}

export function resetMetrics(): void {
  metricBuffer = []
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}
