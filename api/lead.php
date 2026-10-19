<?php
/**
 * Приём заявок с dtpzakon.ru → создание контакта и сделки в amoCRM.
 *
 * Фронт (forms.js) шлёт POST JSON:
 *   { fields: {name, phone, topic, message, _hp}, form, page,
 *     first_touch: {...}, last_touch: {...}, ts, sig }
 *
 * Что делает:
 * 1) анти-бот: honeypot + подпись ts+UA+соль + рейт-лимит (как на miglaw.ru);
 * 2) анти-дубль: открытая сделка с таким телефоном есть → примечание в неё,
 *    новая не создаётся (атрибуция первой заявки сохраняется);
 * 3) создаёт сделку через /leads/complex с UTM-полями и тегами
 *    «Источник: dtpzakon.ru» + «Способ: заявка» (единая таксономия);
 * 4) при недоступности amoCRM — запись в локальный JSON-лог leads-fallback.json
 *    и дубль заявки на почту через Web3Forms (резервный канал, не блокирует).
 *
 * Настройки — config.php рядом (генерится из config.tpl.php при деплое, в git нет).
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_missing']);
    exit;
}
$config = require $configFile;

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'bad_json']);
    exit;
}

$fields = $payload['fields'] ?? [];
$clean = fn($v, int $max): string => mb_substr(preg_replace('/[\x00-\x1F\x7F]+/', ' ', trim((string)$v)), 0, $max);
$form   = $clean($payload['form'] ?? 'unknown', 50);
$page   = $clean($payload['page'] ?? '', 255);
$name   = $clean($fields['name'] ?? '', 100);
$phone  = $clean($fields['phone'] ?? '', 30);

if ($name === '' || $phone === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'name_phone_required']);
    exit;
}

// Нормализация телефона: только цифры, 8... → +7...
$digits = preg_replace('/\D+/', '', $phone);
if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);
if (strlen($digits) === 10) $digits = '7' . $digits;
$phoneNorm = '+' . $digits;

// --- Анти-бот фильтр ---
// Соль должна совпадать с BOT_SALT в forms.js.
$BOT_SALT = $config['bot_salt'] ?? 'dtpzakon_4b7e2c9a1f';

function botFiltered(array $payload, string $salt): bool {
    if (!empty($payload['fields']['_hp'])) return true; // honeypot
    $ts  = (int)($payload['ts'] ?? 0);
    $sig = (string)($payload['sig'] ?? '');
    if (!$ts || !$sig) return true;
    $nowMs = (int)round(microtime(true) * 1000);
    if ($nowMs - $ts < 3000) return true;          // быстрее 3 секунд — не человек
    if (abs($nowMs - $ts) > 86400000) return true; // подпись старше суток
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $s = $ts . ':' . $ua . ':' . $salt;
    $h = 5381;
    for ($i = 0, $n = strlen($s); $i < $n; $i++) {
        $h = (($h * 33) + ord($s[$i])) & 0xFFFFFFFF;
    }
    return !hash_equals(base_convert((string)$h, 10, 36), strtolower($sig));
}

// Рейт-лимит: ≤5 заявок/час с IP и ≤3 заявок/сутки на один телефон
function rateLimited(string $ip, string $phoneDigits): bool {
    $file = __DIR__ . '/rate-limit.json';
    $now = time();
    $data = file_exists($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
    $ipKey = 'ip_' . md5($ip);
    $phKey = 'ph_' . md5($phoneDigits);
    $data[$ipKey] = array_values(array_filter($data[$ipKey] ?? [], fn($t) => $t > $now - 3600));
    $data[$phKey] = array_values(array_filter($data[$phKey] ?? [], fn($t) => $t > $now - 86400));
    $limited = count($data[$ipKey]) >= 5 || count($data[$phKey]) >= 3;
    $data[$ipKey][] = $now;
    $data[$phKey][] = $now;
    foreach ($data as $k => $v) { if (!$v) unset($data[$k]); }
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return $limited;
}

// IP клиента — только REMOTE_ADDR (X-Forwarded-For подделывается)
$clientIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));

if (botFiltered($payload, $BOT_SALT) || rateLimited($clientIp, $digits)) {
    // «Тихий» отказ: боту отвечаем как об успехе, в amoCRM не пишем
    @file_put_contents(
        __DIR__ . '/bots.log',
        date('c') . ' ' . $clientIp . ' ' . $form . ' ' . $phoneNorm . "\n",
        FILE_APPEND | LOCK_EX
    );
    echo json_encode(['ok' => true, 'filtered' => true]);
    exit;
}

// --- UTM и рекламные метки: last_touch, при отсутствии — first_touch ---
$touchKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid', 'roistat'];
$last  = is_array($payload['last_touch'] ?? null) ? $payload['last_touch'] : [];
$first = is_array($payload['first_touch'] ?? null) ? $payload['first_touch'] : [];

$touch = [];
foreach ($touchKeys as $k) {
    $v = trim((string)($last[$k] ?? ''));
    if ($v === '') $v = trim((string)($first[$k] ?? ''));
    if ($v !== '') $touch[$k] = mb_substr($v, 0, 255);
}

// Пользовательские поля сделки: карта «метка => ID поля в amoCRM» из config.php
$customFields = [];
foreach (($config['fields'] ?? []) as $key => $fieldId) {
    if (isset($touch[$key]) && $fieldId) {
        $customFields[] = [
            'field_id' => (int)$fieldId,
            'values'   => [['value' => $touch[$key]]],
        ];
    }
}

// Текст примечания (переиспользуется в анти-дубль ветке)
$noteLines = ['Форма: ' . $form, 'Страница: ' . $page];
if (!empty($fields['topic']))   $noteLines[] = 'Тема: ' . $clean($fields['topic'], 200);
if (!empty($fields['message'])) $noteLines[] = 'Сообщение: ' . $clean($fields['message'], 2000);
foreach ($touch as $k => $v) $noteLines[] = $k . ': ' . $v;
if (!empty($last['referrer'])) $noteLines[] = 'referrer: ' . $last['referrer'];
if (!empty($last['landing']))  $noteLines[] = 'landing: ' . $last['landing'];
if ($first && $first !== $last) {
    $noteLines[] = '--- first touch ---';
    foreach ($touchKeys as $k) {
        if (!empty($first[$k])) $noteLines[] = $k . ': ' . $first[$k];
    }
}

// --- Вызов amoCRM API ---
function amoRequest(array $config, string $method, string $path, ?array $body = null): array {
    $url = 'https://' . $config['subdomain'] . '.amocrm.ru' . $path;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $config['token'],
            'Content-Type: application/json',
        ],
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, $resp === false ? '' : $resp];
}

// --- Анти-дубль: ищем существующий контакт по телефону ---
function phone10(string $raw): string {
    $d = preg_replace('/\D+/', '', $raw);
    if (strlen($d) === 11 && ($d[0] === '8' || $d[0] === '7')) $d = substr($d, 1);
    return strlen($d) >= 10 ? substr($d, -10) : $d;
}

function findContactByPhone(array $config, string $digits): ?array {
    [$code, $resp] = amoRequest($config, 'GET', '/api/v4/contacts?limit=10&query=' . urlencode($digits));
    if ($code < 200 || $code >= 300) return null;
    $found = json_decode($resp, true)['_embedded']['contacts'] ?? [];
    $want = phone10($digits);
    $exact = [];
    foreach ($found as $c) {
        foreach ($c['custom_fields_values'] ?? [] as $f) {
            if (($f['field_code'] ?? '') !== 'PHONE') continue;
            foreach ($f['values'] ?? [] as $v) {
                if (phone10((string)$v['value']) === $want) { $exact[] = $c; break 2; }
            }
        }
    }
    if (!$exact) return null;
    foreach ($exact as $c) {
        [$c2, $r2] = amoRequest($config, 'GET', "/api/v4/contacts/{$c['id']}?with=leads");
        if ($c2 < 200 || $c2 >= 300) continue;
        $full = json_decode($r2, true);
        foreach ($full['_embedded']['leads'] ?? [] as $l) {
            [$c3, $r3] = amoRequest($config, 'GET', "/api/v4/leads/{$l['id']}");
            if ($c3 < 200 || $c3 >= 300) continue;
            $lead = json_decode($r3, true);
            if (in_array($lead['status_id'], [142, 143])) continue;
            if (!empty($config['pipeline_id']) && (int)$lead['pipeline_id'] !== (int)$config['pipeline_id']) continue;
            return ['contact' => $full, 'open_lead' => $lead];
        }
    }
    [$c2, $r2] = amoRequest($config, 'GET', "/api/v4/contacts/{$exact[0]['id']}?with=leads");
    $full = ($c2 >= 200 && $c2 < 300) ? json_decode($r2, true) : $exact[0];
    return ['contact' => $full, 'open_lead' => null];
}

// --- Анти-дубль (до создания) ---
$existing = findContactByPhone($config, $digits);
if ($existing && $existing['open_lead']) {
    $leadId = $existing['open_lead']['id'];
    amoRequest($config, 'POST', "/api/v4/leads/{$leadId}/notes", [[
        'note_type' => 'common',
        'params'    => ['text' => "Повторная заявка с dtpzakon.ru (новая сделка не создана — анти-дубль).\n" . implode("\n", $noteLines)],
    ]]);
    echo json_encode(['ok' => true, 'lead_id' => $leadId, 'dedup' => true]);
    exit;
}

// Стандартные теги единой таксономии (читает бот-аналитик)
$tags = [
    ['name' => 'Источник: dtpzakon.ru'],
    ['name' => 'Способ: заявка'],
];
$method = preg_match('/kviz|quiz|квиз/i', $form) ? 'квиз' : null;
if ($method) $tags[] = ['name' => 'Способ: квиз'];

$lead = [
    'name'       => 'Сайт dtpzakon: ' . $form . ' — ' . $name,
    'request_id' => uniqid('site_', true),
    '_embedded'  => [
        'tags'     => $tags,
        'contacts' => [$existing
            ? ['id' => $existing['contact']['id']]
            : [
                'first_name' => $name,
                'custom_fields_values' => [[
                    'field_code' => 'PHONE',
                    'values'     => [['value' => $phoneNorm, 'enum_code' => 'WORK']],
                ]],
            ]],
    ],
];
if (!empty($config['pipeline_id']))         $lead['pipeline_id'] = (int)$config['pipeline_id'];
if (!empty($config['status_id']))           $lead['status_id'] = (int)$config['status_id'];
if (!empty($config['responsible_user_id'])) $lead['responsible_user_id'] = (int)$config['responsible_user_id'];
if ($customFields)                          $lead['custom_fields_values'] = $customFields;

// Фолбэк: если amoCRM недоступна — заявка не теряется, пишется в JSON-лог (append-only)
function fallbackLog(array $payload): void {
    $line = date('c') . ' ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n";
    @file_put_contents(__DIR__ . '/leads-fallback.json', $line, FILE_APPEND | LOCK_EX);
}

// Резервный канал: дубль заявки на почту через Web3Forms (не блокирует ответ)
function emailBackup(array $config, string $form, string $name, string $phone, array $fields, string $page): void {
    $key = $config['web3forms_key'] ?? '';
    if (!$key || strpos($key, '__') === 0) return; // ключ не задан (плейсхолдер)
    $body = [
        'access_key' => $key,
        'from_name'  => 'Сайт dtpzakon.ru',
        'subject'    => 'Заявка с сайта: ' . $form,
        'name'       => $name,
        'phone'      => $phone,
        'topic'      => (string)($fields['topic'] ?? ''),
        'message'    => (string)($fields['message'] ?? '') . "\n\nСтраница: " . $page,
    ];
    $ch = curl_init('https://api.web3forms.com/submit');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT        => 5,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

[$code, $resp] = amoRequest($config, 'POST', '/api/v4/leads/complex', [$lead]);
$created = json_decode($resp, true);
$leadId  = $created[0]['id'] ?? null;

if ($code >= 200 && $code < 300 && $leadId) {
    amoRequest($config, 'POST', "/api/v4/leads/{$leadId}/notes", [[
        'note_type' => 'common',
        'params'    => ['text' => implode("\n", $noteLines)],
    ]]);
    emailBackup($config, $form, $name, $phoneNorm, $fields, $page);

    echo json_encode(['ok' => true, 'lead_id' => $leadId]);
} else {
    fallbackLog($payload);
    // резерв на почту и при падении amoCRM: иначе заявка оставалась только
    // в файловом логе на сервере, который никто не читает
    emailBackup($config, $form, $name, $phoneNorm, $fields, $page);
    error_log('amoCRM lead error: HTTP ' . $code . ' ' . $resp);
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'amocrm_error']);
}
