-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 16, 2026 at 12:43 PM
-- Server version: 10.11.16-MariaDB
-- PHP Version: 8.5.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";



CREATE TABLE `log` (
  `Student_Id` int(9) NOT NULL,
  `Email` varchar(250) NOT NULL,
  `Password` varchar(250) NOT NULL,
  `Role` enum('participant','organizer') NOT NULL DEFAULT 'participant',
  `First_Name` varchar(100) NOT NULL,
  `Last_Name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `log`
--

INSERT INTO `log` (`Student_Id`, `Email`, `Password`, `Role`, `First_Name`, `Last_Name`) VALUES
(260174, 'cagsawasofiamarie@gmail.com', 'mybday', 'participant', '', ''),
(260175, 'sofiamare28@gmail.com', '$2y$12$FLY7pmdTsxjsOucwiiRAZuWeygyht/wAEjOpld95Z332rbxMIdqci', 'participant', '', ''),
(2601111, 'geraldinecagsawa@yahoo.com', '$2y$12$X.0HpWa0r7iDr8aR7xt7I.YP4g3ZR2ZhXPSATDZskyFKUGPqKZwyi', 'participant', '', ''),
(1234567, 'maristelle.cagsawa@gmail.com', '$2y$12$2ZKJ6JJ/1o3/4vL8.VYWWuT.IWubOZ0Ut4i4j0lmEx/p3Had49gOO', 'participant', '', ''),
(12345, 'admin@gmail.com', '$2y$12$wElO5.U8wXSAuiVZiUQplOt3EgKMBYjiizEDRkSWoeg6q2agKakBa', 'participant', '', ''),
(54321, 'organizer@gmail.com', '$2y$12$p3/7LnpaxN.fYRYEuEHtrex6OX.z47QqLCizD1ftuRLX3WQUobpOC', 'organizer', '', ''),
(11111, 'participant@gmail.com', '$2y$12$MAq9m2o3yAZ/LGPYAzGM1exPW6ar32G7z9wQtkPLbwgM/7Llfhrvy', 'participant', 'Juan', 'Dela Cruz');
COMMIT;

