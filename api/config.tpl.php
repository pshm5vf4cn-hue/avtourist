<?php
/**
 * Шаблон конфигурации api/lead.php.
 * При деплое подставляются реальные секреты вместо плейсхолдеров __...__
 * и результат кладётся в api/config.php (в git не попадает — см. .gitignore).
 *
 * fields: карта «метка => ID пользовательского поля сделки в amoCRM».
 */
return [
    'subdomain' => 'silaprava',
    'token'     => '__AMO_TOKEN__',

    // Соль анти-бот подписи — должна совпадать с BOT_SALT в forms.js
    'bot_salt'  => 'dtpzakon_4b7e2c9a1f',

    // UTM-поля сделки в amoCRM (ID подставить при деплое)
    'fields' => [
        'utm_source'   => __AMO_FIELD_UTM_SOURCE__,
        'utm_medium'   => __AMO_FIELD_UTM_MEDIUM__,
        'utm_campaign' => __AMO_FIELD_UTM_CAMPAIGN__,
    ],

    // Воронка/этап/ответственный — пусто = воронка по умолчанию
    'pipeline_id'         => 0,
    'status_id'           => 0,
    'responsible_user_id' => 0,

    // Резервная отправка заявки на почту (ключ публичный по природе Web3Forms)
    'web3forms_key' => '__WEB3FORMS_KEY__',
];
