from fastapi import Request
from ..core.errors import IndexConfigurationError


def get_services(request: Request):
    services = getattr(request.app.state, 'services', None)
    if services is None:
        raise IndexConfigurationError('Application services are not initialized')
    return services
