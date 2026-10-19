import os
import shutil
import certifi
import tempfile
import logging

logger = logging.getLogger(__name__)

def fix_ssl_paths():
    """
    Workaround for libcurl (used by curl_cffi/yfinance) failing with non-ASCII paths to the CA bundle.
    Copies the certifi bundle to a temporary directory with an ASCII path and updates environment variables.
    """
    try:
        current_ca = certifi.where()
        logger.info(f"Current CA Bundle: {current_ca}")

        # Check for non-ASCII characters in the path
        needs_fix = False
        try:
            current_ca.encode('ascii')
        except UnicodeEncodeError:
            needs_fix = True

        if not needs_fix:
            logger.info("CA Bundle path is ASCII. No fix needed.")
            return

        logger.info("Non-ASCII path detected. Applying workaround...")

        # Create a temp file. The temp dir is usually C:\Users\User\AppData\Local\Temp which should be ASCII.
        # If user name has non-ascii, this might still fail, but usually 'User' is ok.
        with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.pem') as temp_pem:
            with open(current_ca, 'rb') as src:
                shutil.copyfileobj(src, temp_pem)
            new_ca_path = temp_pem.name
        
        # Set environment variables expected by curl and requests
        os.environ['CURL_CA_BUNDLE'] = new_ca_path
        os.environ['REQUESTS_CA_BUNDLE'] = new_ca_path
        os.environ['SSL_CERT_FILE'] = new_ca_path
        
        logger.info(f"SSL Fix Applied: CA bundle copied to {new_ca_path}")
        
    except Exception as e:
        logger.error(f"SSL Fix failed: {e}")
