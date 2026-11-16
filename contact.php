<?php
/**
 * Albinet - contact form handler for cPanel shared hosting.
 * Works with PHP 7.4 and newer. Uses PHP's built-in mail().
 *
 * ======================= SETTINGS (edit these) =========================
 * RECIPIENT_EMAIL : where form messages are delivered.
 * FROM_EMAIL      : the sender address. It MUST be on your own domain
 *                   (e.g. noreply@albi-net.com), otherwise Gmail will
 *                   often reject or spam-folder the message. Create this
 *                   mailbox in cPanel > Email Accounts (or at least make
 *                   sure the domain's SPF/DKIM are enabled in cPanel >
 *                   Email Deliverability).
 * ======================================================================
 */
const RECIPIENT_EMAIL = 'isp.albinet@gmail.com';
const FROM_EMAIL      = 'noreply@albi-net.com';
const FROM_NAME       = 'Albinet Website';
const SUBJECT_PREFIX  = '[albi-net.com] ';
const MIN_SECONDS_BETWEEN_SENDS = 30;
const CONTACT_PAGE    = 'contact.html';

const SERVICES = [
    ''                  => 'Not specified',
    'home-internet'     => 'Home internet',
    'business-internet' => 'Business internet',
    'isp-security'      => 'ISP Security',
    'isp-management'    => 'ISP Management',
    'isp-consulting'    => 'ISP Consulting',
    'support'           => 'Technical issue / support',
    'other'             => 'Other',
];

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$wantsJson = (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)
    || !empty($_SERVER['HTTP_X_REQUESTED_WITH']);

/** Send the result: JSON for the JavaScript form, a redirect otherwise. */
function respond(bool $ok, string $error = '', int $status = 200): void
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error]);
    } else {
        $query = $ok ? 'sent=1' : 'error=' . rawurlencode($error);
        header('Location: ' . CONTACT_PAGE . '?' . $query . '#contact-form', true, 303);
    }
    exit;
}

/** Trim, drop control characters (stops e-mail header injection) and cap length. */
function clean_line($value, int $max): string
{
    $value = is_string($value) ? $value : '';
    $value = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value);
    $value = trim((string) $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

function clean_text($value, int $max): string
{
    $value = is_string($value) ? $value : '';
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $value);
    $value = trim((string) $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

// ---- Only POST is allowed ------------------------------------------------
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    if ($wantsJson) {
        header('Allow: POST');
        respond(false, 'method', 405);
    }
    header('Location: ' . CONTACT_PAGE, true, 303);
    exit;
}

// ---- Honeypot: real people never see or fill the "website" field ----------
if (!empty($_POST['website'])) {
    // Pretend it worked so the bot learns nothing.
    respond(true);
}

// ---- Simple rate limit per browser session --------------------------------
if (session_status() === PHP_SESSION_NONE) {
    session_name('albinet_form');
    @session_start();
}
if (!empty($_SESSION['last_send']) && (time() - (int) $_SESSION['last_send']) < MIN_SECONDS_BETWEEN_SENDS) {
    respond(false, 'rate', 429);
}

// ---- Read and validate fields ---------------------------------------------
$name    = clean_line($_POST['name'] ?? '', 100);
$phone   = clean_line($_POST['phone'] ?? '', 40);
$email   = clean_line($_POST['email'] ?? '', 150);
$service = clean_line($_POST['service'] ?? '', 40);
$message = clean_text($_POST['message'] ?? '', 5000);
$lang    = (($_POST['lang'] ?? '') === 'en') ? 'English' : 'Albanian';

$valid = text_length($name) >= 2
    && preg_match('/^[0-9+()\s.\-\/]{6,40}$/', $phone)
    && ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL))
    && array_key_exists($service, SERVICES)
    && text_length($message) >= 5;

if (!$valid) {
    respond(false, 'validation', 422);
}

// ---- Build the e-mail -----------------------------------------------------
$serviceLabel = SERVICES[$service];
$subject = SUBJECT_PREFIX . 'New message from ' . $name . ($service !== '' ? ' (' . $serviceLabel . ')' : '');
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$body  = "New message from the contact form on albi-net.com\n";
$body .= str_repeat('-', 50) . "\n";
$body .= "Name:     {$name}\n";
$body .= "Phone:    {$phone}\n";
$body .= 'Email:    ' . ($email !== '' ? $email : '(not given)') . "\n";
$body .= "Service:  {$serviceLabel}\n";
$body .= "Language: {$lang}\n";
$body .= str_repeat('-', 50) . "\n\n";
$body .= $message . "\n\n";
$body .= str_repeat('-', 50) . "\n";
$body .= 'Sent: ' . date('Y-m-d H:i:s T') . "\n";
$body .= 'IP:   ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";

$fromName = '=?UTF-8?B?' . base64_encode(FROM_NAME) . '?=';
$headers = [
    'From: ' . $fromName . ' <' . FROM_EMAIL . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: Albinet contact form',
];
if ($email !== '') {
    // "Reply" in Gmail answers the customer directly.
    $headers[] = 'Reply-To: ' . $email;
}
$headerString = implode("\r\n", $headers);

// The -f flag sets the envelope sender (helps SPF). Some hosts forbid it,
// so fall back to a plain mail() call if the first attempt fails.
$sent = @mail(RECIPIENT_EMAIL, $encodedSubject, $body, $headerString, '-f' . FROM_EMAIL);
if (!$sent) {
    $sent = @mail(RECIPIENT_EMAIL, $encodedSubject, $body, $headerString);
}

if (!$sent) {
    error_log('Albinet contact form: mail() failed for message from ' . $email);
    respond(false, 'mail', 500);
}

$_SESSION['last_send'] = time();
respond(true);
