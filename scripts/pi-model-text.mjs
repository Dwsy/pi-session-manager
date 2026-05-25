#!/usr/bin/env node
import { completeSimple, streamSimple } from '@earendil-works/pi-ai'
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent'

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

function resolveModel(registry, provider, modelId) {
  if (provider && modelId) {
    const model = registry.find(provider, modelId)
    if (model) return model
    throw new Error(`Model not found: ${provider}/${modelId}`)
  }

  const available = registry.getAvailable()
  if (available.length > 0) return available[0]

  const all = registry.getAll()
  if (all.length > 0) return all[0]

  throw new Error('No Pi models are configured')
}

async function main() {
  const request = JSON.parse(await readStdin())
  const registry = ModelRegistry.create(AuthStorage.create())
  const model = resolveModel(registry, request.provider, request.model)
  const auth = await registry.getApiKeyAndHeaders(model)
  if (!auth.ok) throw new Error(auth.error)

  const context = {
    systemPrompt: request.systemPrompt,
    messages: requestMessages(request),
    tools: Array.isArray(request.tools) ? request.tools : undefined,
  }

  const options = {
    apiKey: auth.apiKey,
    headers: auth.headers,
    reasoning: request.reasoning,
    maxTokens: request.maxTokens,
  }

  if (request.stream) {
    const eventStream = streamSimple(model, context, options)
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

  const message = await completeSimple(model, context, options)
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
