Feature: SauceDemo Checkout Flow
  As a user of SauceDemo
  I want to complete a checkout
  So that I can verify the e-commerce flow

  Scenario: Complete checkout with standard user
    Given I am on "https://www.saucedemo.com"
    When I fill "Username" with "standard_user"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should see "Products"
    When I click "Add to cart"
    And I click "shopping cart"
    And I click "Checkout"
    When I fill "First Name" with "Test"
    And I fill "Last Name" with "User"
    And I fill "Zip/Postal Code" with "12345"
    And I click "Continue"
    And I click "Finish"
    Then I should see "Thank you for your order"

  Scenario: Login with invalid credentials
    Given I am on "https://www.saucedemo.com"
    When I fill "Username" with "invalid_user"
    And I fill "Password" with "wrong_password"
    And I click "Login"
    Then I should see "Username and password do not match"
