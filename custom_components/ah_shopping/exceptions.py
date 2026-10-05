"""Exceptions for AH Shopping."""

class AhShoppingError(Exception):
    """Base AH Shopping error."""

class AhAuthError(AhShoppingError):
    """Authentication failed."""

class AhRequestError(AhShoppingError):
    """AH rejected a request."""
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status

class AhTransientError(AhShoppingError):
    """Temporary API/network error."""

class AhNotFoundError(AhShoppingError):
    """Requested resource was not found."""
