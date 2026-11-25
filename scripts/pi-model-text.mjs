#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

function assistantText(message) {
  return (message.content || [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
}

function requestMessages(request) {
  if (Array.isArray(request.messages)) {
    return request.messages
  }
  return [
    {
      role: 'user',
      content: String(request.prompt || ''),
      timestamp: Date.now(),
    },
  ]
}

/** Match only OpenCode Go on the official service, like the Rust settings probe's `opencode_go::is_go_url`. */
function isOpenCodeGoUrl(base) {
  let url
  try {
    url = new URL(base)
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname === 'opencode.ai' && url.port === ''
    && ['/inference/go', '/zen/go'].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
}

/** Provider failures resolve as an assistant message; text callers must see them as a failed request. */
function assertCompleted(message) {
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new Error(message.errorMessage || `Pi AI request ${message.stopReason}`)
  }
}

function resolveModel(runtime, provider, modelId) {
  if (provider && modelId) {
    const model = runtime.getModel(provider, modelId)
    if (model) return model
    throw new Error(`Model not found: ${provider}/${modelId}`)
  }

  const available = runtime.getAvailableSnapshot()
  if (available.length > 0) return available[0]

  const all = runtime.getModels()
  if (all.length > 0) return all[0]

  throw new Error('No Pi models are configured')
}

async function main() {
  const request = JSON.parse(await readStdin())
  const runtime = await ModelRuntime.create()
  const model = resolveModel(runtime, request.provider, request.model)
  const resolved = await runtime.getAuth(model)
  const auth = resolved?.auth
  if (!auth) throw new Error(`No auth available for ${request.provider || 'default'}/${request.model || 'default'}`)

  const context = {
    systemPrompt: request.systemPrompt,
    messages: requestMessages(request),
    tools: Array.isArray(request.tools) ? request.tools : undefined,
  }

  // OpenCode Go rejects requests without a conversation ID. Agents pass one stable ID per session;
  // plain text calls get a fresh one. Send it only to official Go routes, never to proxies or other providers.
  const sessionId = request.sessionId || `psm-${randomUUID()}`
  const headers = isOpenCodeGoUrl(auth.baseUrl || model.baseUrl) ? { ...auth.headers, 'x-opencode-session': sessionId } : auth.headers

  const options = {
    apiKey: auth.apiKey,
    headers,
    baseUrl: auth.baseUrl,
    reasoning: request.reasoning,
    maxTokens: request.maxTokens,
  }

  if (request.stream) {
    // Agent callers receive raw Pi events, errors included, and own the terminal message themselves.
    const eventStream = runtime.streamSimple(model, context, options)
    for await (const event of eventStream) {
      if (request.protocol === 'pi-agent') {
        writeEvent(event)
      } else if (event.type === 'text_delta') {
        writeEvent({ type: 'delta', delta: event.delta })
      }
    }
    if (request.protocol === 'pi-agent') return

    // Text callers get a failed helper run instead of an empty successful answer.
    const finalMessage = await eventStream.result()
    assertCompleted(finalMessage)
    writeEvent({
      type: 'done',
      response: {
        text: assistantText(finalMessage),
        provider: finalMessage.provider || model.provider,
        model: finalMessage.model || model.id,
      },
    })
    return
  }

  const message = await runtime.completeSimple(model, context, options)
  assertCompleted(message)
  writeEvent({
    type: 'done',
    response: {
      text: assistantText(message),
      provider: message.provider || model.provider,
      model: message.model || model.id,
    },
  })
}

main().catch((error) => {
  writeEvent({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
})
