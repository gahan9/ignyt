import pytest
from pydantic import ValidationError

from app.models.checkin import BadgeOcrRequest, BadgeOcrResponse, CheckInRequest, CheckInResponse
from app.models.common import BudgetStatus, ErrorResponse, HealthResponse
from app.models.concierge import ChatMessageIn, ConciergeRequest
from app.models.photos import LabelRequest, LabelResponse, SignedUrlRequest, SignedUrlResponse


class TestHealthResponse:
    def test_valid(self) -> None:
        m = HealthResponse(status="healthy", service="ignyt-api")
        assert m.status == "healthy"

    def test_missing_field_raises(self) -> None:
        with pytest.raises(ValidationError):
            HealthResponse.model_validate({"status": "ok"})


class TestErrorResponse:
    def test_valid(self) -> None:
        m = ErrorResponse(detail="something went wrong")
        assert m.detail == "something went wrong"


class TestBudgetStatus:
    def test_valid(self) -> None:
        m = BudgetStatus(gemini_used=5, gemini_limit=100, vision_used=2, vision_limit=50)
        assert m.gemini_used == 5


class TestCheckInRequest:
    def test_valid(self) -> None:
        m = CheckInRequest(event_id="demo-event", attendee_id="att-001")
        assert m.event_id == "demo-event"

    def test_missing_attendee_id_raises(self) -> None:
        with pytest.raises(ValidationError):
            CheckInRequest.model_validate({"event_id": "demo-event"})


class TestCheckInResponse:
    def test_valid(self) -> None:
        m = CheckInResponse(attendee_id="att-001", name="Alice", checked_in=True, message="OK")
        assert m.checked_in is True


class TestBadgeOcrRequest:
    def test_valid(self) -> None:
        m = BadgeOcrRequest(event_id="e1", image_base64="abc123")
        assert m.event_id == "e1"

    def test_image_too_long_raises(self) -> None:
        with pytest.raises(ValidationError):
            BadgeOcrRequest(event_id="e1", image_base64="x" * 2_000_001)


class TestBadgeOcrResponse:
    def test_defaults(self) -> None:
        m = BadgeOcrResponse(detected_text=["hello"])
        assert m.matched_attendee is None
        assert m.confidence == 0.0

    def test_with_match(self) -> None:
        m = BadgeOcrResponse(detected_text=["Alice"], matched_attendee="att-001", confidence=0.85)
        assert m.matched_attendee == "att-001"


class TestSignedUrlRequest:
    def test_valid(self) -> None:
        m = SignedUrlRequest(event_id="e1", filename="photo.jpg")
        assert m.content_type == "image/jpeg"

    def test_custom_content_type(self) -> None:
        m = SignedUrlRequest(event_id="e1", filename="pic.png", content_type="image/png")
        assert m.content_type == "image/png"


class TestSignedUrlResponse:
    def test_valid(self) -> None:
        m = SignedUrlResponse(upload_url="https://...", gcs_uri="gs://bucket/file")
        assert m.gcs_uri.startswith("gs://")


class TestLabelRequest:
    def test_valid(self) -> None:
        m = LabelRequest(event_id="e1", gcs_uri="gs://bucket/img.jpg")
        assert m.gcs_uri == "gs://bucket/img.jpg"


class TestLabelResponse:
    def test_valid(self) -> None:
        m = LabelResponse(labels=["cat", "dog"], photo_id="p1")
        assert len(m.labels) == 2

    def test_empty_labels(self) -> None:
        m = LabelResponse(labels=[], photo_id="p1")
        assert m.labels == []


class TestChatMessageIn:
    def test_valid_user(self) -> None:
        m = ChatMessageIn(role="user", content="hello")
        assert m.role == "user"

    def test_valid_assistant(self) -> None:
        m = ChatMessageIn(role="assistant", content="hi there")
        assert m.role == "assistant"

    def test_invalid_role_raises(self) -> None:
        with pytest.raises(ValidationError):
            ChatMessageIn(role="system", content="nope")

    def test_empty_content_raises(self) -> None:
        with pytest.raises(ValidationError):
            ChatMessageIn(role="user", content="")

    def test_content_too_long_raises(self) -> None:
        with pytest.raises(ValidationError):
            ChatMessageIn(role="user", content="x" * 2001)


class TestConciergeRequest:
    def test_valid(self) -> None:
        m = ConciergeRequest(messages=[ChatMessageIn(role="user", content="Where is Room A?")])
        assert len(m.messages) == 1

    def test_empty_messages_raises(self) -> None:
        with pytest.raises(ValidationError):
            ConciergeRequest(messages=[])

    def test_too_many_messages_raises(self) -> None:
        msgs = [ChatMessageIn(role="user", content=f"msg {i}") for i in range(21)]
        with pytest.raises(ValidationError):
            ConciergeRequest(messages=msgs)
