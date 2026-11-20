-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 20, 2026 at 03:07 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `resort_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `rooms`
--

CREATE TABLE `rooms` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'Standard',
  `capacity` int(11) NOT NULL DEFAULT 2,
  `price_per_night` decimal(10,2) NOT NULL,
  `description` text DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `status` enum('available','occupied','cleaning','maintenance','out_of_service') NOT NULL DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  `amenities` text DEFAULT NULL,
  `room_number` varchar(30) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rooms`
--

INSERT INTO `rooms` (`id`, `name`, `type`, `capacity`, `price_per_night`, `description`, `image_url`, `status`, `created_at`, `updated_at`, `deleted_at`, `amenities`, `room_number`) VALUES
(1, 'Room 101', 'Standard', 1, 1500.00, 'Palm tree view, large bed, wooden furniture, flat-screen TV', '/uploads/room-1-1794220929976.jpg', 'occupied', '2026-11-09 08:38:29', '2026-11-17 21:37:29', NULL, NULL, NULL),
(2, 'Room 102', 'Deluxe', 2, 2500.00, 'A cozy room with two comfortable beds, warm lighting, and a simple Filipino-style design. Perfect for two guests.', '/uploads/room-2-1794222854466.jpg', 'available', '2026-11-09 08:38:29', '2026-11-09 13:10:49', NULL, NULL, NULL),
(3, 'Room 103', 'Family Suite', 4, 6000.00, 'A bright and spacious room with four comfortable beds, a cozy sofa, and a garden view. Perfect for a family of four.', '/uploads/room-3-1794223381678.jpg', 'available', '2026-11-09 08:38:29', '2026-11-09 11:24:10', NULL, NULL, NULL),
(4, 'Room 104', 'Couple', 2, 2000.00, 'A cozy room for couples with a large king-size bed, warm wooden walls, a high roof, and a private balcony with a beautiful mountain view.', '/uploads/room-4-1794224152339.jpg', 'available', '2026-11-09 08:38:29', '2026-11-09 11:35:52', NULL, NULL, NULL),
(5, 'Cottage Palm', 'Cottage', 2, 2200.00, 'Native-style cottage near the lagoon', NULL, 'available', '2026-11-09 08:38:29', '2026-11-09 12:51:03', '2026-11-09 12:51:03', NULL, NULL),
(6, 'Room 105', 'Deluxe', 2, 5000.00, 'Twin beds, spacious sofa, wooden furniture, stone walls, round coffee table, warm lighting, built-in shelves.', '/uploads/room-6-1794761426618.jpg', 'available', '2026-11-15 16:50:26', '2026-11-15 16:52:55', NULL, NULL, NULL),
(7, 'Room 106', 'Suite', 2, 3000.00, 'King-size bed, modern furniture, balcony with scenic view, cozy seating area, stylish lighting, elegant interior design.', '/uploads/room-7-1794761708802.jpg', 'occupied', '2026-11-15 16:54:49', '2026-11-17 17:01:04', NULL, NULL, NULL),
(8, 'Room 107', 'Standard', 2, 1800.00, '', '/uploads/room-8-1794762891372.jpg', 'available', '2026-11-15 17:14:51', '2026-11-15 17:14:51', NULL, NULL, NULL),
(9, 'Room 108', 'Standard', 2, 3500.00, '', '/uploads/room-9-1794762933452.jpg', 'available', '2026-11-15 17:15:33', '2026-11-15 17:15:33', NULL, NULL, NULL),
(10, 'Room 109', 'Standard', 2, 4000.00, '', '/uploads/room-10-1794763025782.jpg', 'available', '2026-11-15 17:16:40', '2026-11-15 17:17:05', NULL, NULL, NULL),
(11, 'Room 110', 'Standard', 3, 3200.00, '', '/uploads/room-11-1794763114164.jpg', 'available', '2026-11-15 17:18:33', '2026-11-15 17:18:58', '2026-11-15 17:18:58', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `rooms`
--
ALTER TABLE `rooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_room_number` (`room_number`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `rooms`
--
ALTER TABLE `rooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
