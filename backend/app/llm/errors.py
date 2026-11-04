class LlmProviderError(Exception):
    pass


class LlmTimeoutError(LlmProviderError):
    pass


class LlmNotConfiguredError(Exception):
    pass


class LlmNotSupportedProvider(Exception):
    pass
