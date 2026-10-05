from custom_components.ah_shopping.models import Product, ShoppingItem, ShoppingListData

def test_product_parse_and_total():
    p=Product.from_api({"webshopId":123,"title":"Melk","currentPrice":1.49,"priceBeforeBonus":1.79,"isBonus":True,"bonusMechanism":"25% korting","images":[{"url":"small","width":80},{"url":"large","width":400}]})
    assert p.id==123 and p.image_url=="large" and p.is_bonus
    data=ShoppingListData("abc","Boodschappen",(ShoppingItem("i1",123,2,p),))
    assert data.total_quantity==2
    assert data.estimated_total==2.98
    assert data.quantity_for_product(123)==2

def test_missing_price_is_safe():
    p=Product.from_api({"webshopId":5,"title":"X"})
    assert p.price_now==0
