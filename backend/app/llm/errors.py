class LlmProviderError(Exception):
    pass


class LlmTimeoutError(LlmProviderError):
    pass


class LlmInvalidRequestError(Exception):
    pass


class LlmNotConfiguredError(Exception):
    pass


class LlmNotSupportedProvider(Exception):
    pass
