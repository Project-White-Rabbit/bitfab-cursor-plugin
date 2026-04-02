type JsonRpcResult = {
  result?: { content: { type: "text"; text: string }[]; isError?: boolean }
  error?: { message: string }
}

export type McpConfig = {
  serviceUrl: string
  apiKey: string | null
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  }
}

export function parseSSEData(text: string): string | null {
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "))
  return dataLine ? dataLine.slice(6) : null
}

export async function parseResponse(
  response: Response,
): Promise<JsonRpcResult> {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("text/event-stream")) {
    const text = await response.text()
    const data = parseSSEData(text)
    if (!data) {
      throw new Error("Empty SSE response")
    }
    return JSON.parse(data)
  }
  return response.json()
}

export class McpProxy {
  private sessionId: string | null = null

  async fetch(
    config: McpConfig,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${config.apiKey}`,
    }
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId
    }

    const response = await fetch(`${config.serviceUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })

    const newSessionId = response.headers.get("mcp-session-id")
    if (newSessionId) {
      this.sessionId = newSessionId
    }

    return response
  }

  async ensureSession(config: McpConfig) {
    if (this.sessionId) {
      return
    }

    const response = await this.fetch(config, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "bitfab-plugin", version: "1.0.0" },
    })

    if (!response.ok) {
      throw new Error(`Initialize failed (${response.status})`)
    }

    await parseResponse(response)
  }

  async toolCall(
    config: McpConfig,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    if (!config.apiKey) {
      return errorResult(
        "Not authenticated. Run /bitfab:login to connect your Bitfab account.",
      )
    }

    try {
      await this.ensureSession(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return errorResult(`Failed to initialize Bitfab session: ${message}`)
    }

    let response: Response
    try {
      response = await this.fetch(config, "tools/call", {
        name: toolName,
        arguments: args,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return errorResult(`Network error connecting to Bitfab: ${message}`)
    }

    // Stale session — clear and retry once
    if (response.status === 404) {
      this.sessionId = null
      try {
        await this.ensureSession(config)
        response = await this.fetch(config, "tools/call", {
          name: toolName,
          arguments: args,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return errorResult(`Failed to reconnect to Bitfab: ${message}`)
      }
    }

    if (!response.ok) {
      return errorResult(
        `Bitfab API error (${response.status}): ${await response.text().catch(() => "unknown")}`,
      )
    }

    let data: JsonRpcResult
    try {
      data = await parseResponse(response)
    } catch {
      return errorResult("Failed to parse response from Bitfab API")
    }

    if (data.error) {
      return errorResult(`Bitfab error: ${data.error.message}`)
    }

    return data.result ?? errorResult("Empty response from Bitfab API")
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  clearSession() {
    this.sessionId = null
  }
}
