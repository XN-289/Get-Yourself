UPDATE agent_trace_artifacts
SET content_summary = '[legacy artifact redacted]',
    content_json = JSON_OBJECT(
            'artifactType', artifact_type,
            'summary', '[legacy artifact redacted]',
            'redaction', JSON_OBJECT(
                    'mode', 'legacy-summary-only',
                    'rawContentRetained', FALSE
            )
    ),
    redacted = TRUE,
    content_hash = LOWER(SHA2(JSON_OBJECT(
            'artifactType', artifact_type,
            'summary', '[legacy artifact redacted]',
            'redaction', JSON_OBJECT(
                    'mode', 'legacy-summary-only',
                    'rawContentRetained', FALSE
            )
    ), 256));
