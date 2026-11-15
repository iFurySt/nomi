-- Asset identity survives entity tombstones and history cleanup.
CREATE TABLE sync_asset_identities (
 space_id text NOT NULL REFERENCES sync_spaces(id),
 id text NOT NULL,
 sha256 text NOT NULL,
 bytes bigint NOT NULL,
 mime text NOT NULL,
 PRIMARY KEY(space_id,id)
);
