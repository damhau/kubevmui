from kubernetes import client
from kubernetes.client import ApiException

from app.models.auth import UserInfo


async def validate_k8s_token(token: str, api_client: client.ApiClient | None) -> UserInfo:
    if not api_client:
        return UserInfo(username="anonymous", authenticated=False)
    auth_api = client.AuthenticationV1Api(api_client)
    try:
        review = client.V1TokenReview(spec=client.V1TokenReviewSpec(token=token))
        result = auth_api.create_token_review(review)
        if result.status.authenticated:
            return UserInfo(
                username=result.status.user.username,
                groups=result.status.user.groups or [],
                authenticated=True,
            )
    except ApiException:
        pass
    return UserInfo(username="anonymous", authenticated=False)
