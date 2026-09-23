class APIError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status

    def as_dict(self):
        return {"code": self.code, "message": self.message}


class SimulationRejected(Exception):
    """The engine may raise this with a player-facing game-rule validation message."""
