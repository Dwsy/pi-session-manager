#!/usr/bin/env node
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

  const options = {
    apiKey: auth.apiKey,
    headers: auth.headers,
    baseUrl: auth.baseUrl,
    reasoning: request.reasoning,
    maxTokens: request.maxTokens,
  }

  if (request.stream) {
    const eventStream = runtime.streamSimple(model, context, options)
    let finalMessage = null
    for await (const event of eventStream) {
      if (request.protocol === 'pi-agent') {
        writeEvent(event)
        if (event.type === 'done') finalMessage = event.message
        if (event.type === 'error') finalMessage = event.error
        continue
      }
      if (event.type === 'text_delta') {
        writeEvent({ type: 'delta', delta: event.delta })
      } else if (event.type === 'done') {
        finalMessage = event.message
      } else if (event.type === 'error') {
        finalMessage = event.error
        writeEvent({ type: 'error', error: event.error.errorMessage || 'Pi AI stream failed' })
      }
    }
    if (request.protocol === 'pi-agent') {
      finalMessage ||= await eventStream.result()
      return
    }
    finalMessage ||= await eventStream.result()
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
