package com.caresync.common.security;

import com.caresync.auth.entity.Role;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Authenticated user principal extracted from verified JWT claims.
 */
public class UserPrincipal implements UserDetails {

    private final UUID userId;
    private final String email;
    private final String fullName;
    private final Role role;
    private final UUID patientId;
    private final UUID doctorId;
    private final List<GrantedAuthority> authorities;

    public UserPrincipal(
            UUID userId,
            String email,
            String fullName,
            Role role,
            UUID patientId,
            UUID doctorId) {
        this.userId = userId;
        this.email = email;
        this.fullName = fullName;
        this.role = role;
        this.patientId = patientId;
        this.doctorId = doctorId;
        this.authorities = List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }

    public String getFullName() {
        return fullName;
    }

    public Role getRole() {
        return role;
    }

    public UUID getPatientId() {
        return patientId;
    }

    public UUID getDoctorId() {
        return doctorId;
    }

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    public boolean isReceptionist() {
        return role == Role.RECEPTIONIST;
    }

    public boolean isDoctor() {
        return role == Role.DOCTOR;
    }

    public boolean isPatient() {
        return role == Role.PATIENT;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
