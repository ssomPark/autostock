"""Notification API routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.db.database import get_async_session
from src.models.db_models import NotificationModel, UserModel

router = APIRouter()


@router.get("")
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """사용자 알림 목록 조회."""
    query = select(NotificationModel).where(
        NotificationModel.user_id == user.id
    )
    if unread_only:
        query = query.where(NotificationModel.is_read == False)
    query = query.order_by(NotificationModel.created_at.desc()).limit(limit)

    result = await session.execute(query)
    notifications = result.scalars().all()

    # Unread count
    count_query = select(func.count()).select_from(NotificationModel).where(
        NotificationModel.user_id == user.id,
        NotificationModel.is_read == False,
    )
    count_result = await session.execute(count_query)
    unread_count = count_result.scalar() or 0

    return {
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ],
        "unread_count": unread_count,
    }


@router.get("/unread-count")
async def get_unread_count(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """읽지 않은 알림 수."""
    result = await session.execute(
        select(func.count()).select_from(NotificationModel).where(
            NotificationModel.user_id == user.id,
            NotificationModel.is_read == False,
        )
    )
    return {"unread_count": result.scalar() or 0}


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """알림 읽음 처리."""
    result = await session.execute(
        select(NotificationModel).where(
            NotificationModel.id == notification_id,
            NotificationModel.user_id == user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")

    notification.is_read = True
    await session.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_as_read(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """모든 알림 읽음 처리."""
    await session.execute(
        update(NotificationModel)
        .where(
            NotificationModel.user_id == user.id,
            NotificationModel.is_read == False,
        )
        .values(is_read=True)
    )
    await session.commit()
    return {"ok": True}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """알림 삭제."""
    result = await session.execute(
        select(NotificationModel).where(
            NotificationModel.id == notification_id,
            NotificationModel.user_id == user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")

    await session.delete(notification)
    await session.commit()
    return {"ok": True}


# --- Helper function for creating notifications (used by other modules) ---

async def create_notification(
    session: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    message: str = "",
    link: str | None = None,
):
    """알림 생성 헬퍼."""
    notification = NotificationModel(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
    )
    session.add(notification)
    await session.commit()
    return notification
