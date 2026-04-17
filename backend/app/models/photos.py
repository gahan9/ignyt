from pydantic import BaseModel


class SignedUrlRequest(BaseModel):
    event_id: str
    filename: str
    content_type: str = "image/jpeg"


class SignedUrlResponse(BaseModel):
    upload_url: str
    gcs_uri: str


class LabelRequest(BaseModel):
    event_id: str
    gcs_uri: str


class LabelResponse(BaseModel):
    labels: list[str]
    photo_id: str
