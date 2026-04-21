---
type: overview
tags: [engineering, product]
owner: Mike
updated: 2026-04-21
status: current
---
### Overview

---

We are building a new platform for agencies who service humans with developmental disabilities through a tech enabled remote monitoring platform. Our product will enable agencies to reduce the number of FTEs that are required in-home to deliver care. This will alleviate a significant amount of operating and profit margin pressure from the agency, while delivering a better experience to the humans we serve, helping them to be more independent in their home and community.

**Engineering focus (2026):** ship in quarterly roadmap increments while hardening production paths across the operator app, APIs, and device integrations. Use the **Heylo 2026 Roadmap** link under Planning and Resources for current priorities; treat that roadmap as the live planning source rather than fixed historical dates.

### Technical Summary

---

Our platform includes sensor and communication hardware that is installed in a home and a software platform that enables agency employees to provide remote monitoring as support to home based staff and clients. The software platform also provides managerial insight and analytics to agency stakeholders.

For hardware solutions, we are utilizing the [SmartThings](https://partners.smartthings.com/) ecosystem, a comprehensive, cloud-based platform that integrates a wide range of smart home devices, including sensors, cameras, and smart alarms, using protocols like Zigbee and Z-Wave. It provides robust APIs and a reliable hub for seamless communication between devices, making it highly suitable for creating automated and monitored environments. For our company, SmartThings is an ideal choice because it enables rapid deployment of essential smart home technology, such as motion detectors and emergency response buttons, while offering flexibility for customization and integration into our Amazon Web Services-based monitoring platform.

We are using [AWS](https://aws.amazon.com/?nc2=h_lg) on the cloud application side because it provides a highly scalable, secure, and reliable infrastructure that meets the demands of real-time data processing and storage. AWS offers a comprehensive suite of services, such as AWS Lambda for serverless computing, Amazon DynamoDB for low-latency data storage, and AWS IoT Core for seamless integration with our SmartThings devices. These services allow us to build a robust and efficient backend that can handle large volumes of data from sensors and devices, ensuring quick response times and high availability. Additionally, AWS's built-in security features, such as data encryption and compliance with industry standards, give us the confidence to protect sensitive user information.

This technical infrastructure allows us to deliver a secure, efficient, and scalable solution to enhance safety and support for humans we serve.

### Planning and Resources

---

_Below are the key pages to organize product development and engineering. Each page includes a task management section that aggregates to the primary task management database for the company._

[PRDs](https://www.notion.so/PRDs-2ee88e22373380e7a817defca1d5f48c?pvs=21)

[Engineering Docs](https://www.notion.so/Engineering-Docs-2ee88e22373380328ba7f8f9fe1ab988?pvs=21)

[Handoff Tracking (Proposal)](https://www.notion.so/Handoff-Tracking-Proposal-2f088e22373380fb8949e8896cb4856c?pvs=21)

[Heylo 2026 Roadmap (Quarterly View)](https://www.notion.so/Heylo-2026-Roadmap-Quarterly-View-30488e2237338001b0add2ca482796af?pvs=21)

[Release Notes](https://www.notion.so/Release-Notes-30a88e2237338069969aeda715456072?pvs=21)

[AI Agent for State Analysis](https://www.notion.so/AI-Agent-for-State-Analysis-31788e223733801db241c8bc4084bc52?pvs=21)