class PipelineError(Exception):
    """Safe client-facing message; log underlying exceptions on the server."""
    status_code = 422


class InvalidFile(PipelineError):
    status_code = 400


class ConversionError(PipelineError):
    pass


class ParsingError(PipelineError):
    pass


class ModelError(PipelineError):
    status_code = 503


class StorageError(PipelineError):
    status_code = 503


class IndexConfigurationError(PipelineError):
    status_code = 409
