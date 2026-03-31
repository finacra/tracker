-- CIA conversation history tables
CREATE TABLE IF NOT EXISTS cia_conversations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cia_messages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES cia_conversations(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cia_conversations_company ON cia_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_cia_conversations_user ON cia_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_cia_messages_conversation ON cia_messages(conversation_id);
