package com.caresync;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class CareSyncApplication {

    public static void main(String[] args) {
        SpringApplication.run(CareSyncApplication.class, args);
    }
}
