-- -----------------------------------------------------------------
-- SCRIPT DE CRIAÇÃO DO BANCO 
-- -----------------------------------------------------------------

-- Apaga o banco de dados antigo para começar do zero
DROP DATABASE IF EXISTS georah_db;

-- Cria o novo banco de dados
CREATE DATABASE georah_db;

-- Seleciona o banco de dados para usar
USE georah_db;

-- Tabela 1: Usuários
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE, -- Usaremos o CPF/Email como chave
    senha VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela 2: Propriedades (A tabela final)
CREATE TABLE IF NOT EXISTS properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,               -- Chave estrangeira para a tabela users
    car_code VARCHAR(100) NOT NULL UNIQUE,
    nome_propriedade VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,   -- (Será 0.0 por enquanto)
    longitude DECIMAL(11, 8) NOT NULL,  -- (Será 0.0 por enquanto)
    plus_code VARCHAR(255) NULL,
    boundary JSON NULL,                 -- Armazena o GeoJSON do polígono
    possui_endereco BOOLEAN DEFAULT FALSE,
    municipio VARCHAR(100),
    uf CHAR(2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela 3: Tabela Temporária (Para onde o CSV será importado)
CREATE TABLE IF NOT EXISTS staging_properties (
    cod_tema TEXT,
    nome_tema TEXT,
    cod_imovel TEXT,
    mod_fiscais TEXT,
    num_area TEXT,
    ind_status TEXT,
    ind_tipo TEXT,
    des_condic TEXT,
    municipio TEXT,
    cod_estado TEXT,
    dat_criaca TEXT,
    dat_atuali TEXT,
    cod_cpf_cnpj TEXT,
    WKT TEXT -- Coluna da geometria
);

select * from properties where nome_propriedade ="fdsfsdf" ;
select * from properties;
select * from users;