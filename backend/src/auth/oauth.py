"""OAuth client configuration using authlib."""

from authlib.integrations.starlette_client import OAuth

from src.config.settings import settings

oauth = OAuth()

# Google (OpenID Connect)
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)
