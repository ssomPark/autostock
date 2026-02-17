"""Authentication routes: OAuth login, callback, token refresh, user info."""

from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.auth.jwt import create_access_token, create_refresh_token, decode_token
from src.auth.oauth import oauth
from src.config.settings import settings
from src.db.database import get_async_session
from src.models.db_models import UserModel

router = APIRouter()

ALLOWED_PROVIDERS = {"google"}


@router.get("/login/{provider}")
async def login(provider: str, request: Request):
    if provider not in ALLOWED_PROVIDERS:
        return {"error": f"Unsupported provider: {provider}"}
    client = oauth.create_client(provider)
    redirect_uri = f"{request.base_url}api/auth/callback/{provider}"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/callback/{provider}")
async def callback(
    provider: str,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    if provider not in ALLOWED_PROVIDERS:
        return {"error": f"Unsupported provider: {provider}"}

    client = oauth.create_client(provider)
    token = await client.authorize_access_token(request)

    # Extract user info
    userinfo = token.get("userinfo", {})
    email = userinfo.get("email", "")
    name = userinfo.get("name", "")
    avatar_url = userinfo.get("picture", "")
    provider_id = userinfo.get("sub", "")

    # Upsert user
    result = await session.execute(
        select(UserModel).where(
            UserModel.provider == provider,
            UserModel.provider_id == provider_id,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = UserModel(
            email=email,
            name=name,
            avatar_url=avatar_url,
            provider=provider,
            provider_id=provider_id,
        )
        session.add(user)
    else:
        user.email = email
        user.name = name
        user.avatar_url = avatar_url
        user.last_login_at = datetime.now()

    await session.commit()
    await session.refresh(user)

    # Issue tokens
    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    # Redirect to frontend with access token; set refresh token as httpOnly cookie
    redirect_url = f"{settings.frontend_url}/auth/callback?token={access_token}"
    response = RedirectResponse(url=redirect_url)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_refresh_token_expire_days * 86400,
        path="/",
    )
    return response


@router.post("/refresh")
async def refresh(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        return JSONResponse({"error": "No refresh token"}, status_code=401)

    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        return JSONResponse({"error": "Invalid refresh token"}, status_code=401)

    user_id = int(payload["sub"])
    result = await session.execute(select(UserModel).where(UserModel.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return JSONResponse({"error": "User not found"}, status_code=401)

    access_token = create_access_token(user.id, user.email)
    return {"access_token": access_token}


@router.get("/me")
async def me(user: UserModel = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "provider": user.provider,
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}
