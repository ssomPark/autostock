"""커뮤니티 게시판 API."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.dependencies import get_admin_user, get_current_user, get_current_user_optional
from src.db.database import get_async_session
from src.models.db_models import CommunityCommentModel, CommunityPostModel, UserModel

router = APIRouter()


# --- Schemas ---

class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(..., min_length=1)
    category: str = Field(default="discussion")


class PostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    content: str | None = Field(None, min_length=1)
    category: str | None = None


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


# --- Helpers ---

VALID_CATEGORIES = {"discussion", "question", "tips", "proof"}


def _post_to_dict(post: CommunityPostModel) -> dict:
    return {
        "id": post.id,
        "user_id": post.user_id,
        "author_name": post.user.name if post.user else None,
        "author_avatar": post.user.avatar_url if post.user else None,
        "title": post.title,
        "content": post.content,
        "category": post.category,
        "view_count": post.view_count,
        "comment_count": post.comment_count,
        "is_pinned": post.is_pinned,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
    }


def _comment_to_dict(comment: CommunityCommentModel) -> dict:
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "author_name": comment.user.name if comment.user else None,
        "author_avatar": comment.user.avatar_url if comment.user else None,
        "content": comment.content,
        "is_deleted": comment.is_deleted,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


# --- Post endpoints ---

@router.get("/posts")
async def list_posts(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    category: str | None = None,
    sort_by: str = Query("created_at", pattern="^(created_at|view_count)$"),
    session: AsyncSession = Depends(get_async_session),
):
    """게시글 목록 (공개)."""
    conditions = [CommunityPostModel.is_deleted == False]
    if category and category in VALID_CATEGORIES:
        conditions.append(CommunityPostModel.category == category)

    # Count
    count_q = select(func.count()).select_from(CommunityPostModel).where(*conditions)
    total = (await session.execute(count_q)).scalar() or 0

    # Order: pinned first, then sort_by desc
    order_cols = [CommunityPostModel.is_pinned.desc()]
    if sort_by == "view_count":
        order_cols.append(CommunityPostModel.view_count.desc())
    order_cols.append(CommunityPostModel.created_at.desc())

    q = (
        select(CommunityPostModel)
        .options(selectinload(CommunityPostModel.user))
        .where(*conditions)
        .order_by(*order_cols)
        .offset((page - 1) * size)
        .limit(size)
    )
    posts = (await session.execute(q)).scalars().all()

    return {
        "posts": [_post_to_dict(p) for p in posts],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/posts/{post_id}")
async def get_post(
    post_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """게시글 상세 + 조회수 증가."""
    q = (
        select(CommunityPostModel)
        .options(selectinload(CommunityPostModel.user))
        .where(CommunityPostModel.id == post_id, CommunityPostModel.is_deleted == False)
    )
    post = (await session.execute(q)).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    post.view_count = (post.view_count or 0) + 1
    await session.commit()
    await session.refresh(post)

    return _post_to_dict(post)


@router.post("/posts", status_code=201)
async def create_post(
    body: PostCreate,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """게시글 작성 (로그인 필수)."""
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 카테고리: {body.category}")

    post = CommunityPostModel(
        user_id=user.id,
        title=body.title.strip(),
        content=body.content.strip(),
        category=body.category,
    )
    session.add(post)
    await session.commit()
    await session.refresh(post, attribute_names=["user"])

    return _post_to_dict(post)


@router.put("/posts/{post_id}")
async def update_post(
    post_id: int,
    body: PostUpdate,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """게시글 수정 (작성자 또는 관리자)."""
    from src.config.settings import settings

    q = (
        select(CommunityPostModel)
        .options(selectinload(CommunityPostModel.user))
        .where(CommunityPostModel.id == post_id, CommunityPostModel.is_deleted == False)
    )
    post = (await session.execute(q)).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    admin_list = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
    is_admin = user.email.lower() in admin_list

    if post.user_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")

    if body.title is not None:
        post.title = body.title.strip()
    if body.content is not None:
        post.content = body.content.strip()
    if body.category is not None:
        if body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 카테고리: {body.category}")
        post.category = body.category

    post.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()
    await session.refresh(post)

    return _post_to_dict(post)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """게시글 소프트 삭제 (작성자 또는 관리자)."""
    from src.config.settings import settings

    post = (await session.execute(
        select(CommunityPostModel).where(CommunityPostModel.id == post_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    admin_list = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
    is_admin = user.email.lower() in admin_list

    if post.user_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")

    post.is_deleted = True
    post.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.commit()

    return {"success": True}


# --- Comment endpoints ---

@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """댓글 목록 (공개)."""
    # Verify post exists
    post = (await session.execute(
        select(CommunityPostModel).where(
            CommunityPostModel.id == post_id, CommunityPostModel.is_deleted == False
        )
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    q = (
        select(CommunityCommentModel)
        .options(selectinload(CommunityCommentModel.user))
        .where(
            CommunityCommentModel.post_id == post_id,
            CommunityCommentModel.is_deleted == False,
        )
        .order_by(CommunityCommentModel.created_at.asc())
    )
    comments = (await session.execute(q)).scalars().all()

    return {"comments": [_comment_to_dict(c) for c in comments]}


@router.post("/posts/{post_id}/comments", status_code=201)
async def create_comment(
    post_id: int,
    body: CommentCreate,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """댓글 작성 (로그인 필수)."""
    post = (await session.execute(
        select(CommunityPostModel).where(
            CommunityPostModel.id == post_id, CommunityPostModel.is_deleted == False
        )
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    comment = CommunityCommentModel(
        post_id=post_id,
        user_id=user.id,
        content=body.content.strip(),
    )
    session.add(comment)

    post.comment_count = (post.comment_count or 0) + 1
    await session.commit()
    await session.refresh(comment, attribute_names=["user"])

    return _comment_to_dict(comment)


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """댓글 소프트 삭제 (작성자 또는 관리자)."""
    from src.config.settings import settings

    comment = (await session.execute(
        select(CommunityCommentModel).where(CommunityCommentModel.id == comment_id)
    )).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

    admin_list = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
    is_admin = user.email.lower() in admin_list

    if comment.user_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")

    comment.is_deleted = True
    comment.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Decrement post comment count
    post = (await session.execute(
        select(CommunityPostModel).where(CommunityPostModel.id == comment.post_id)
    )).scalar_one_or_none()
    if post and (post.comment_count or 0) > 0:
        post.comment_count -= 1

    await session.commit()

    return {"success": True}
