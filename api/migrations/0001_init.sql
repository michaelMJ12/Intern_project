
-- Homes
CREATE TABLE homes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_homes_name_not_empty
        CHECK (length(trim(name)) > 0)
);

-- Members
CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_members_home
        FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_members_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT ck_members_position_positive
        CHECK (position > 0),

    CONSTRAINT uq_members_home_position
        UNIQUE (home_id, position)
);

-- Bills
CREATE TABLE bills (
    id TEXT PRIMARY KEY NOT NULL,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_bills_home
        FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_bills_title_not_empty
        CHECK (length(trim(title)) > 0),

    CONSTRAINT ck_bills_total_positive
        CHECK (
            typeof(total_cents) = 'integer'
            AND total_cents > 0
        )
);

-- Bill shares
CREATE TABLE bill_shares (
    id TEXT PRIMARY KEY NOT NULL,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT DEFAULT NULL,

    CONSTRAINT fk_shares_bill
        FOREIGN KEY (bill_id)
        REFERENCES bills(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shares_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_bill_member
        UNIQUE (bill_id, member_id),

    CONSTRAINT ck_share_amount_non_negative
        CHECK (
            typeof(amount_cents) = 'integer'
            AND amount_cents >= 0
        )
);

CREATE INDEX idx_members_home
ON members(home_id, position);

CREATE INDEX idx_bills_home
ON bills(home_id);

CREATE INDEX idx_shares_bill
ON bill_shares(bill_id);

CREATE INDEX idx_shares_member
ON bill_shares(member_id);
