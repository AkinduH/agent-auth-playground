Authenticating AI Agents

AI agent acting on its own¶
In this scenario, the AI agent operates autonomously without user involvement, supporting background processes, monitoring tasks, and independently running automation workflows.

Agent friendly authentication mechanism

AI agents often require machine-to-machine communication.
This flow does not use redirects.
The agent leverages authentication APIs to securely obtain tokens for autonomous access.
When acting on its own, the AI agent uses its Agent ID and Agent Secret to authenticate with the authorization server and obtain an access token.

Agent Acting on its Own Flow Diagram

The AI agent begins the authentication flow by initiating an authorize request.

curl --location 'https://api.asgardeo.io/t/{organization_name}/oauth2/authorize' \
--header 'Accept: application/json' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'client_id=vMH8K3zdIhlSiIDmmvnebNOI_bIa' \
--data-urlencode 'response_type=code' \
--data-urlencode 'redirect_uri=https://example.com/callback' \
--data-urlencode 'scope=read_bookings write_bookings' \
--data-urlencode 'response_mode=direct' \
--data-urlencode 'resource=booking_api'
The agent receives the following response that contains key components like the flowId parameter that uniquely identifies the login flow and the authenticators array that contains the authentication options available for the first step.


{
  "flowId": "3bd1f207-e5b5-4b45-8a91-13b0acfb2151",
  "flowStatus": "INCOMPLETE",
  "flowType": "AUTHENTICATION",
  "nextStep": {
    "stepType": "AUTHENTICATOR_PROMPT",
    "authenticators": [
      {
        "authenticatorId": "QmFzaWNBdXRoZW50aWNhdG9yOkxPQ0FM",
        "authenticator": "Username & Password",
        "idp": "LOCAL",
        "metadata": {
          "i18nKey": "authenticator.basic",
          "promptType": "USER_PROMPT",
          "params": [
            {
              "param": "username",
              "type": "STRING",
              "isConfidential": false,
              "order": 1,
              "i18nKey": "param.username"
            }
          ]
        },
        "requiredParams": [
          "username",
          "password"
        ]
      }
    ],
    "acceptErrorParams": false,
    "messages": [
      {
        "type": "ERROR",
        "messageId": "msg_invalid_un_pw",
        "message": "Invalid username or password.",
        "i18nKey": "message.msg_invalid_un_pw",
        "context": [
          {
            "key": "remainingAttempts",
            "value": "2"
          }
        ]
      }
    ]
  },
  "links": [
    {
      "name": "authentication",
      "href": "/api/authenticate/v1",
      "method": "POST"
    }
  ]
}
The agent makes a POST request to the /authn endpoint using the Authentication API. The payload of this request includes the flowId and the selectedAuthenticator object which contains credentials for the user-selected authentication option.

curl --location 'https://api.asgardeo.io/t/{organization_name}/oauth2/authn' \
--header 'Content-Type: application/json' \
--data '{
"flowId": "3bd1f207-e5b5-4b45-8a91-13b0acfb2151",
"selectedAuthenticator": {
    "authenticatorId": "QmFzaWNBdXRoZW50aWNhdG9yOkxPQ0FM",
    "params": {
        "username": "<agent_id>",
        "password": "<agent_secret>"

    }
}
}'
If the request is successful, the agent will receive a response with the following format.


{
   "code": "6ff8b7e1-01fc-39b9-b56d-a1f5826e6d2a",
   "state": "logpg",
   "session_state": "43b1ffc92c8d349942e99bd0270fca05f934ad6f612b27f40a5fa60b96bd0iD4RK8Etr4XruxnYMEvcKQ"
}
As the final step, the agent sends a token request with the received authorization code to the authorization server’s token endpoint, using its own credentials (Agent ID and Secret). The server verifies these credentials, and upon successful authentication, issues an access token. The agent then includes this access token in its requests to securely access protected resources.

curl --location 'https://api.asgardeo.io/t/{organization_name}/oauth2/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=authorization_code' \
--data-urlencode 'client_id=vMH8K3zdIhlSiIDmmvnebNOI_bIa' \
--data-urlencode 'code=3a23a94a-3c50-3b56-92fa-f583cb63c617' \
--data-urlencode 'code_verifier=FehTNaOvDMhpP9wgdGb_AWR5Gu5KwTmF978KMRKbtgM' \
--data-urlencode 'redirect_uri=https://example.com/callback' \
--data-urlencode 'resource=booking_api'