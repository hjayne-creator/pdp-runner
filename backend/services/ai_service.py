"""
AI service: routes requests to the correct provider and streams tokens.
"""
import os
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

load_dotenv()


async def stream_openai(
    model_id: str,
    prompt: str,
    max_tokens: int = 8192,
    config: dict = {},
) -> AsyncGenerator[str, None]:
    from openai import AsyncOpenAI

    api_key = config.get("api_key") or os.getenv("OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=api_key)

    messages = [{"role": "user", "content": prompt}]
    system = config.get("system_prompt")
    if system:
        messages = [{"role": "system", "content": system}] + messages

    base_params = {
        "model": model_id,
        "messages": messages,
        "stream": True,
        "temperature": config.get("temperature", 0.3),
    }

    # GPT-5 models require `max_completion_tokens` instead of `max_tokens`.
    # Keep a compatibility fallback for older models.
    try:
        stream = await client.chat.completions.create(
            **base_params,
            max_completion_tokens=max_tokens,
        )
    except Exception as exc:
        msg = str(exc)

        # Some models (including certain GPT-5 variants) only support default
        # temperature and reject explicit values.
        if "temperature" in msg and "default (1)" in msg:
            no_temp_params = dict(base_params)
            no_temp_params.pop("temperature", None)
            try:
                stream = await client.chat.completions.create(
                    **no_temp_params,
                    max_completion_tokens=max_tokens,
                )
            except Exception as exc2:
                if "max_completion_tokens" not in str(exc2):
                    raise
                stream = await client.chat.completions.create(
                    **no_temp_params,
                    max_tokens=max_tokens,
                )
        elif "max_completion_tokens" in msg:
            stream = await client.chat.completions.create(
                **base_params,
                max_tokens=max_tokens,
            )
        else:
            raise

    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


async def stream_anthropic(
    model_id: str,
    prompt: str,
    max_tokens: int = 8192,
    config: dict = {},
) -> AsyncGenerator[str, None]:
    import anthropic

    api_key = config.get("api_key") or os.getenv("ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key)

    system = config.get("system_prompt", "You are a helpful AI assistant.")

    async with client.messages.stream(
        model=model_id,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        temperature=config.get("temperature", 0.3),
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def run_ai_stream(
    provider: str,
    model_id: str,
    prompt: str,
    max_tokens: int = 8192,
    config: dict = {},
) -> AsyncGenerator[str, None]:
    """Dispatch to the correct provider stream."""
    if provider == "openai":
        async for chunk in stream_openai(model_id, prompt, max_tokens, config):
            yield chunk
    elif provider == "anthropic":
        async for chunk in stream_anthropic(model_id, prompt, max_tokens, config):
            yield chunk
    else:
        raise ValueError(f"Unknown provider: {provider}")


async def run_ai_complete(
    provider: str,
    model_id: str,
    prompt: str,
    max_tokens: int = 8192,
    config: dict = {},
) -> tuple[str, Optional[int], Optional[int]]:
    """Run AI and collect full response. Returns (text, input_tokens, output_tokens)."""
    chunks = []
    async for chunk in run_ai_stream(provider, model_id, prompt, max_tokens, config):
        chunks.append(chunk)
    return "".join(chunks), None, None
