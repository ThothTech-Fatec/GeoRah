-- -----------------------------------------------------------------
-- SCRIPT DE TRANSFORMAÇÃO (Mover do Staging para o Final)
-- -----------------------------------------------------------------

-- PASSO 1: Cria os usuários a partir dos CPFs
INSERT INTO users (nome_completo, email, senha)
SELECT DISTINCT
    CONCAT('Usuário ', cod_cpf_cnpj) AS nome_completo,
    CONCAT(cod_cpf_cnpj, '@georah.com') AS email,
    'mudar123' -- Senha placeholder
FROM
    staging_properties
WHERE
    cod_cpf_cnpj IS NOT NULL AND cod_cpf_cnpj != '';


-- PASSO 2: Insere as propriedades, vinculando ao usuário (CPF)
INSERT IGNORE INTO properties (
    user_id,
    car_code,
    nome_propriedade,
    latitude,
    longitude,
    boundary,
    municipio,
    uf,
    possui_endereco
)
SELECT
    u.id,               -- O ID do usuário que criamos no Passo 1
    s.cod_imovel,
    CONCAT('Propriedade ', s.cod_imovel), 
    0.0,                -- Placeholder (vamos arrumar depois)
    0.0,                -- Placeholder (vamos arrumar depois)
    ST_AsGeoJSON(ST_GeomFromText(s.WKT)), -- A conversão correta para GeoJSON
    s.municipio,
    (CASE s.cod_estado   -- O mapeamento de Código para UF
        WHEN '11' THEN 'RO'
        WHEN '12' THEN 'AC'
        WHEN '13' THEN 'AM'
        WHEN '14' THEN 'RR'
        WHEN '15' THEN 'PA'
        WHEN '16' THEN 'AP'
        WHEN '17' THEN 'TO'
        WHEN '21' THEN 'MA'
        WHEN '22' THEN 'PI'
        WHEN '23' THEN 'CE'
        WHEN '24' THEN 'RN'
        WHEN '25' THEN 'PB'
        WHEN '26' THEN 'PE'
        WHEN '27' THEN 'AL'
        WHEN '28' THEN 'SE'
        WHEN '29' THEN 'BA'
        WHEN '31' THEN 'MG'
        WHEN '32' THEN 'ES'
        WHEN '33' THEN 'RJ'
        WHEN '35' THEN 'SP'
        WHEN '41' THEN 'PR'
        WHEN '42' THEN 'SC'
        WHEN '43' THEN 'RS'
        WHEN '50' THEN 'MS'
        WHEN '51' THEN 'MT'
        WHEN '52' THEN 'GO'
        WHEN '53' THEN 'DF'
        ELSE 'XX'
    END),
    TRUE
FROM
    staging_properties s
-- O JOIN que faz a mágica de vincular a propriedade ao dono:
JOIN 
    users u ON u.email = CONCAT(s.cod_cpf_cnpj, '@georah.com') 
WHERE 
    -- Ignora linhas com geometria inválida
    s.WKT IS NOT NULL AND s.WKT != '';
    
-- 1. Quantos usuários foram criados? (Deve ser o n° de CPFs únicos)
SELECT COUNT(*) AS total_de_usuarios FROM users;

-- 2. Quantas propriedades foram inseridas?
SELECT COUNT(*) AS total_de_propriedades FROM properties;

select * from users;


UPDATE properties 
SET 
    latitude = ST_Y(
        ST_Centroid(
            -- TRUQUE: Força o SRID 0 (planar) para o ST_Centroid funcionar
            ST_GeomFromGeoJSON(boundary, 1, 0)
        )
    ),
    longitude = ST_X(
        ST_Centroid(
            -- TRUQUE: Força o SRID 0 (planar) para o ST_Centroid funcionar
            ST_GeomFromGeoJSON(boundary, 1, 0)
        )
    )
WHERE 
    id > 0; -- Para evitar o erro de "Safe Update Mode"
    
SELECT 
    car_code,
    latitude,
    longitude,
    municipio,
    uf
FROM 
    properties 
LIMIT 10;



-- Desabilita o modo de segurança temporariamente para permitir o UPDATE sem chave no WHERE principal
SET SQL_SAFE_UPDATES = 0;

UPDATE properties p
SET p.boundary = (
    SELECT 
        -- 3. Agrega os objetos criados em um único array JSON
        JSON_ARRAYAGG(
            -- 2. Cria um objeto JSON {"latitude": lat, "longitude": lng} para cada par
            JSON_OBJECT(
                'latitude', jt.latitude, 
                'longitude', jt.longitude
            )
        )
    FROM 
        -- 1. Usa JSON_TABLE para extrair os pares [lng, lat] do array de coordenadas
        JSON_TABLE(
            -- Seleciona o array de coordenadas correto (primeiro anel) baseado no tipo
            CASE 
                -- Se for MultiPolygon, pega coordinates[0][0]
                WHEN JSON_UNQUOTE(JSON_EXTRACT(p.boundary, '$.type')) = 'MultiPolygon' 
                THEN JSON_EXTRACT(p.boundary, '$.coordinates[0][0]')
                -- Se for Polygon, pega coordinates[0]
                WHEN JSON_UNQUOTE(JSON_EXTRACT(p.boundary, '$.type')) = 'Polygon' 
                THEN JSON_EXTRACT(p.boundary, '$.coordinates[0]')
                -- Caso contrário (ou se for inválido), retorna um array vazio para evitar erro
                ELSE JSON_ARRAY()
            END,
            '$[*]' COLUMNS (
                -- Extrai a longitude (índice 0) e a latitude (índice 1)
                longitude DECIMAL(11, 8) PATH '$[0]', 
                latitude DECIMAL(10, 8) PATH '$[1]'
            )
        ) AS jt
)
-- Processa apenas as linhas que realmente têm um boundary no formato GeoJSON esperado
WHERE 
    JSON_VALID(p.boundary) -- Garante que é JSON válido
    AND JSON_EXTRACT(p.boundary, '$.type') IS NOT NULL -- Garante que tem a chave 'type'
    AND JSON_EXTRACT(p.boundary, '$.coordinates') IS NOT NULL; -- Garante que tem a chave 'coordinates'

-- ///////////////////// --
-- 1. Alterar a tabela USERS
-- Adiciona a coluna CPF, que deve ser único para garantir a identidade
ALTER TABLE users
ADD COLUMN cpf VARCHAR(14) UNIQUE NULL AFTER nome_completo; 
-- OBS: O CPF DEVE ser ÚNICO se for usado como identificador principal!

-- 2. Alterar a tabela PROPERTIES (para facilitar a associação e consultas)
-- Adiciona a coluna CPF para espelhar o dono da propriedade
ALTER TABLE properties
ADD COLUMN cpf_proprietario VARCHAR(14) NULL AFTER user_id;

-- 3.
-- Desabilita o modo de segurança para permitir os UPDATEs em massa
SET SQL_SAFE_UPDATES = 0;

-- Atualiza a tabela 'properties' com o CPF da tabela 'staging'
-- (Ligação via car_code = cod_imovel)
UPDATE properties p
JOIN staging_properties sp ON p.car_code = sp.cod_imovel
SET 
    p.cpf_proprietario = sp.cod_cpf_cnpj
WHERE 
    sp.cod_cpf_cnpj IS NOT NULL AND sp.cod_cpf_cnpj != '';

-- Atualiza a tabela 'users' com o CPF da tabela 'staging'
-- (Ligação via email gerado = cod_cpf_cnpj)
UPDATE users u
JOIN staging_properties sp ON u.email = CONCAT(sp.cod_cpf_cnpj, '@georah.com')
SET 
    u.cpf = sp.cod_cpf_cnpj
WHERE 
    sp.cod_cpf_cnpj IS NOT NULL AND sp.cod_cpf_cnpj != '';

-- Reabilita o modo de segurança
SET SQL_SAFE_UPDATES = 1;
-- ///////////////////// --
-- Reabilita o modo de segurança
SET SQL_SAFE_UPDATES = 1;

-- Verifica o resultado em algumas linhas
SELECT id, car_code, LEFT(CAST(boundary AS CHAR), 200) AS boundary_start 
FROM properties 
WHERE boundary IS NOT NULL
LIMIT 5;