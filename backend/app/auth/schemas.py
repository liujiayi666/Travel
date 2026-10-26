import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr

    @field_validator("display_name", mode="before")
    @classmethod
    def strip_display_name(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("password", mode="after")
    @classmethod
    def reject_blank_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("密码不能为空")
        return value


class UserResponse(BaseModel):
    id: uuid.UUID
    display_name: str
    email: EmailStr
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
