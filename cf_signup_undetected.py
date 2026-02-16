#!/usr/bin/env python3
"""
Cloudflare Account Creation - Undetected ChromeDriver
Uses advanced anti-detection to bypass bot challenges
"""

import sys
import time
import json
import re
import base64

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("Installing dependencies...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'undetected-chromedriver', 'selenium'])
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

SCRAPERAPI_KEY = '0732a61c08af7fd42b1285a6c144c3f2'
GOOGLE_SESSION = '/data/playwright-auth/google-lair404.json'

PROFILE = {
    'firstName': 'Lars',
    'lastName': 'Viervier',
    'company': 'lair404 Infrastructure',
    'phone': '+49 9493 123456'
}

def main():
    print('🚀 Cloudflare Account Automation')
    print('=' * 70)

    # Configure Chrome with proxy
    options = uc.ChromeOptions()
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--proxy-server=http://proxy-server.scraperapi.com:8001')
    options.add_argument('--window-size=1920,1080')

    # Create undetected driver
    print('\n[0/8] Launching undetected Chrome...')
    driver = uc.Chrome(options=options, headless=True)

    # Set proxy auth via CDP
    auth_string = base64.b64encode(f'scraperapi:api_key={SCRAPERAPI_KEY}'.encode()).decode()
    driver.execute_cdp_cmd('Network.setExtraHTTPHeaders', {
        'headers': {'Proxy-Authorization': f'Basic {auth_string}'}
    })

    try:
        # Load Google cookies
        print('[0/8] Loading Google session...')
        driver.get('https://accounts.google.com')
        time.sleep(2)

        with open(GOOGLE_SESSION) as f:
            storage = json.load(f)
            cookies = storage.get('cookies', [])

        for cookie in cookies:
            if '.google.com' in cookie.get('domain', ''):
                driver.add_cookie({
                    'name': cookie['name'],
                    'value': cookie['value'],
                    'domain': cookie['domain'],
                    'path': cookie.get('path', '/'),
                    'secure': cookie.get('secure', False)
                })

        print(f'[0/8] ✅ Loaded {len(cookies)} cookies\n')

        # Step 1: Navigate
        print('[1/8] Navigating to Cloudflare signup...')
        driver.get('https://dash.cloudflare.com/sign-up')
        time.sleep(20)  # Wait for challenge

        driver.save_screenshot('/tmp/cf-step1.png')
        print(f'[1/8] Title: {driver.title}')

        if 'challenge' in driver.current_url.lower():
            print('[1/8] ⚠️ Still on challenge, waiting...')
            time.sleep(30)

        # Step 2: Google SSO
        print('\n[2/8] Clicking Google button...')
        wait = WebDriverWait(driver, 15)

        try:
            google_btn = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//button[contains(., 'Google')] | //a[contains(., 'Google')]")
            ))
            google_btn.click()
            print('[2/8] ✅ Clicked')
        except:
            print('[2/8] No button found')

        # Step 3: OAuth
        print('\n[3/8] Waiting for OAuth...')
        time.sleep(8)
        wait.until(EC.url_contains('dash.cloudflare.com'))
        driver.save_screenshot('/tmp/cf-step3.png')

        # Step 4: Profile form
        print('\n[4/8] Checking for profile form...')
        try:
            driver.find_element(By.NAME, 'firstName').send_keys(PROFILE['firstName'])
            driver.find_element(By.NAME, 'lastName').send_keys(PROFILE['lastName'])
            driver.find_element(By.NAME, 'company').send_keys(PROFILE['company'])
            driver.find_element(By.NAME, 'phone').send_keys(PROFILE['phone'])

            driver.save_screenshot('/tmp/cf-step4.png')
            driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
            time.sleep(3)
            print('[4/8] ✅ Filled profile')
        except:
            print('[4/8] No profile form')

        # Step 5: Extract Account ID
        print('\n[5/8] Extracting Account ID...')
        url = driver.current_url
        match = re.search(r'([a-f0-9]{32})', url)

        if not match:
            raise Exception(f'No Account ID in URL: {url}')

        account_id = match.group(1)
        with open('/tmp/cf-account-id.txt', 'w') as f:
            f.write(account_id)
        print(f'[5/8] ✅ {account_id}')

        # Step 6: API tokens page
        print('\n[6/8] Going to API tokens...')
        driver.get('https://dash.cloudflare.com/profile/api-tokens')
        time.sleep(3)
        driver.save_screenshot('/tmp/cf-step6.png')

        # Step 7: Create token
        print('\n[7/8] Creating token...')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Create Token')]"))).click()
        time.sleep(2)

        wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Use template')]"))).click()
        time.sleep(2)

        wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Continue')]"))).click()
        time.sleep(2)

        wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Create Token')]"))).click()
        time.sleep(4)

        driver.save_screenshot('/tmp/cf-step7.png')

        # Step 8: Extract token
        print('\n[8/8] Extracting token...')
        token_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'input[readonly]')))
        token = token_input.get_attribute('value')

        if not token or len(token) < 20:
            raise Exception('Invalid token')

        with open('/tmp/cf-api-token.txt', 'w') as f:
            f.write(token)

        print(f'[8/8] ✅ {token[:60]}...')

        print('\n' + '=' * 70)
        print('✅ SUCCESS!')
        print('=' * 70)
        print(f'Account ID: {account_id}')
        print(f'Token: {token[:70]}...')
        print('=' * 70)

        return 0

    except Exception as e:
        print(f'\n❌ Error: {e}')
        driver.save_screenshot('/tmp/cf-error.png')
        return 1
    finally:
        driver.quit()

if __name__ == '__main__':
    sys.exit(main())
