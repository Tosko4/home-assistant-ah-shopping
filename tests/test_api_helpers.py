from custom_components.ah_shopping.api import AhShoppingApiClient

def test_extract_code_plain():
    assert AhShoppingApiClient.extract_authorization_code("abc") == "abc"

def test_extract_code_callback():
    assert AhShoppingApiClient.extract_authorization_code("appie://login-exit?code=hello%201") == "hello 1"
