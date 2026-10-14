from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    top_k: int | None = Field(default=None, ge=1, le=100)
    filters: dict[str, str | int] = Field(default_factory=dict)

    @field_validator('query')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Query cannot be blank')
        return value.strip()

    @field_validator('filters')
    @classmethod
    def known_filters(cls, value):
        allowed = {'document_id', 'document_type', 'document_code', 'file_type',
                   'category', 'department', 'sheet', 'slide', 'section'}
        if value.keys() - allowed:
            raise ValueError('Unsupported metadata filter')
        return value


class FolderRequest(BaseModel):
    path: str = ''
    force: bool = False


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    category: str = Field(default='', max_length=300)

    @model_validator(mode='after')
    def nonblank(self):
        self.question = self.question.strip()
        if not self.question:
            raise ValueError('Question cannot be blank')
        return self


class Review(BaseModel):
    action: Literal['approve', 'edit', 'reject']
    answer: str = Field(default='', max_length=16000)

    @model_validator(mode='after')
    def valid_edit(self):
        if self.action == 'edit' and not self.answer.strip():
            raise ValueError('An edited answer cannot be empty')
        return self


class ClarificationReply(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)

    @model_validator(mode='after')
    def nonblank(self):
        self.answer = self.answer.strip()
        if not self.answer:
            raise ValueError('Clarification reply cannot be blank')
        return self


