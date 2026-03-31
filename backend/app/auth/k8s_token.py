import logging

from kubernetes import client
from kubernetes.client import ApiException

from app.models.auth import UserInfo

logger = logging.getLogger(__name__)


async def validate_k8s_token(token: str, api_client: client.ApiClient | None) -> UserInfo:
    if not api_client:
        logger.error("No api_client available for token validation")
        return UserInfo(username="anonymous", authenticated=False)
    logger.info("Validating token (first 20 chars): %s...", token[:20])
    logger.info("API client host: %s", api_client.configuration.host)
    auth_api = client.AuthenticationV1Api(api_client)
    try:
        review = client.V1TokenReview(spec=client.V1TokenReviewSpec(token=token))
        result = auth_api.create_token_review(review)
        logger.info(
            "TokenReview result: authenticated=%s, user=%s, error=%s",
            result.status.authenticated,
            getattr(result.status.user, "username", None) if result.status.user else None,
            result.status.error,
        )
        if result.status.authenticated:
            return UserInfo(
                username=result.status.user.username,
                groups=result.status.user.groups or [],
                authenticated=True,
            )
    except ApiException as e:
        logger.error(
            "TokenReview API error: status=%s, reason=%s, body=%s", e.status, e.reason, e.body
        )
    except Exception as e:
        logger.error("TokenReview unexpected error: %s", e, exc_info=True)
    return UserInfo(username="anonymous", authenticated=False)
