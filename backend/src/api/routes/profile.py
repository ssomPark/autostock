"""공개 프로필 + 팔로우 API."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user, get_current_user_optional
from src.db.database import get_async_session
from src.models.db_models import (
    UserFollowModel,
    UserModel,
)

router = APIRouter()


@router.get("/{user_id}")
async def get_profile(
    user_id: int,
    current_user: UserModel | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_async_session),
):
    """공개 프로필 조회."""
    user = (await session.execute(
        select(UserModel).where(UserModel.id == user_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    follower_count = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.following_id == user_id
        )
    )).scalar() or 0

    following_count = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.follower_id == user_id
        )
    )).scalar() or 0

    is_following = False
    if current_user and current_user.id != user_id:
        existing = (await session.execute(
            select(UserFollowModel).where(
                UserFollowModel.follower_id == current_user.id,
                UserFollowModel.following_id == user_id,
            )
        )).scalar_one_or_none()
        is_following = existing is not None

    return {
        "id": user.id,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "follower_count": follower_count,
        "following_count": following_count,
        "is_following": is_following,
    }


@router.put("/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """팔로우 (멱등 — 이미 팔로우 중이면 무시)."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="자기 자신을 팔로우할 수 없습니다.")

    target = (await session.execute(
        select(UserModel).where(UserModel.id == user_id)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    existing = (await session.execute(
        select(UserFollowModel).where(
            UserFollowModel.follower_id == current_user.id,
            UserFollowModel.following_id == user_id,
        )
    )).scalar_one_or_none()

    if not existing:
        session.add(UserFollowModel(follower_id=current_user.id, following_id=user_id))
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()

    follower_count = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.following_id == user_id
        )
    )).scalar() or 0

    return {"following": True, "follower_count": follower_count}


@router.delete("/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """언팔로우 (멱등 — 팔로우 안 되어있으면 무시)."""
    existing = (await session.execute(
        select(UserFollowModel).where(
            UserFollowModel.follower_id == current_user.id,
            UserFollowModel.following_id == user_id,
        )
    )).scalar_one_or_none()

    if existing:
        await session.delete(existing)
        await session.commit()

    follower_count = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.following_id == user_id
        )
    )).scalar() or 0

    return {"following": False, "follower_count": follower_count}


@router.get("/{user_id}/followers")
async def get_followers(
    user_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_async_session),
):
    """팔로워 목록."""
    from sqlalchemy.orm import selectinload

    total = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.following_id == user_id
        )
    )).scalar() or 0

    follows = (await session.execute(
        select(UserFollowModel)
        .options(selectinload(UserFollowModel.follower))
        .where(UserFollowModel.following_id == user_id)
        .order_by(UserFollowModel.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )).scalars().all()

    return {
        "users": [
            {
                "id": f.follower.id,
                "name": f.follower.name,
                "avatar_url": f.follower.avatar_url,
            }
            for f in follows
        ],
        "total": total,
    }


@router.get("/{user_id}/following")
async def get_following(
    user_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_async_session),
):
    """팔로잉 목록."""
    from sqlalchemy.orm import selectinload

    total = (await session.execute(
        select(func.count()).select_from(UserFollowModel).where(
            UserFollowModel.follower_id == user_id
        )
    )).scalar() or 0

    follows = (await session.execute(
        select(UserFollowModel)
        .options(selectinload(UserFollowModel.following))
        .where(UserFollowModel.follower_id == user_id)
        .order_by(UserFollowModel.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )).scalars().all()

    return {
        "users": [
            {
                "id": f.following.id,
                "name": f.following.name,
                "avatar_url": f.following.avatar_url,
            }
            for f in follows
        ],
        "total": total,
    }
